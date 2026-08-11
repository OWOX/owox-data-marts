import { ReportAggregateFunction } from '../../dto/schemas/aggregate-function.schema';
import { ColumnRefResolver, SqlClauseRenderer } from '../utils/sql-clause-renderer';

/**
 * Everything the blended-query collaborators need from the warehouse dialect — and nothing
 * else. `AbstractBlendedQueryBuilder` supplies it (its own members are `protected`, so it
 * hands over a small adapter rather than `this`), which is what lets the CTE and metric-sleeve
 * SQL live outside the class hierarchy while still rendering per-dialect identifiers,
 * aggregates and clauses.
 *
 * Strictly dialect-specific members only: how this warehouse spells identifiers and aggregates.
 * Re-aggregation policy and logging are NOT here — they are the same for every warehouse, and a
 * port that carries them invites the sixth dialect to override something it should not.
 *
 * No text cast and no string concatenation: every sleeve carries a row identity as SEPARATE TUPLE
 * SLOTS, so nothing in the blended path reduces a key to one text scalar. Only the FLAT
 * main-Data-Mart `COUNT(DISTINCT …)` does, and it reads `SqlClauseRenderer` directly.
 *
 * `clauseRenderer` is a FUNCTION, not a property: every dialect implements it as a getter over
 * an instance field, so it must be read at call time — an eagerly captured value would be
 * `undefined` for a subclass whose field initializer has not run yet.
 */
export interface BlendedSqlDialect {
  quoteIdentifier(name: string): string;
  quoteFieldRef(ref: string): string;
  buildAggregation(aggregateFunction: ReportAggregateFunction, fieldName: string): string;
  buildRowSurrogate(partitionByRefs: readonly string[]): string;
  clauseRenderer(): SqlClauseRenderer | null;
}

/**
 * One `LEFT JOIN <right> ON <left>.<source> = <right>.<target> [AND …]` line.
 *
 * The blend emits this shape in four places — a parent's `_joined` CTE pulling in a child, the
 * outer query pulling in a root dedup CTE, and a sleeve pulling in either a raw ancestor or a
 * dedup CTE. All four must render the SAME condition for the SAME relationship, or a sleeve
 * silently aggregates over a different row set than the query it feeds. That invariant used to
 * be stated only in prose, across a class boundary, with four independent copies of the
 * `.map(...).join(' AND ')` beneath it.
 *
 * What legitimately differs between the four is the two aliases and the indentation, so those
 * are the parameters; nothing else about the shape is a caller's choice.
 */
export function renderLeftJoinOn(
  dialect: BlendedSqlDialect,
  opts: {
    /** Alias owning `sourceFieldName` — the parent side of the relationship. */
    leftAlias: string;
    /** Alias owning `targetFieldName` — the joined side, and the table being joined in. */
    rightAlias: string;
    joinConditions: readonly { sourceFieldName: string; targetFieldName: string }[];
    indent?: string;
  }
): string {
  const left = dialect.quoteIdentifier(opts.leftAlias);
  const right = dialect.quoteIdentifier(opts.rightAlias);
  const on = opts.joinConditions
    .map(
      jc =>
        `${left}.${dialect.quoteFieldRef(jc.sourceFieldName)} = ` +
        `${right}.${dialect.quoteFieldRef(jc.targetFieldName)}`
    )
    .join(' AND ');
  return `${opts.indent ?? ''}LEFT JOIN ${right} ON ${on}`;
}

/**
 * Resolves a report column to its qualified SQL reference: a blended column through the root
 * chain's dedup CTE (`<root>.<outputAlias>`), a main-native one through `main`. Shared by the
 * outer query and by every metric sleeve — a sleeve that resolved columns differently from the
 * outer query is exactly the class of defect fixed.
 */
export function createColumnQualifier(
  dialect: BlendedSqlDialect,
  outputAliasToRoot: ReadonlyMap<string, string>
): ColumnRefResolver {
  return (column: string) => {
    const rootAlias = outputAliasToRoot.get(column);
    if (rootAlias) {
      return `${dialect.quoteIdentifier(rootAlias)}.${dialect.quoteIdentifier(column)}`;
    }
    return `${dialect.quoteIdentifier('main')}.${dialect.quoteFieldRef(column)}`;
  };
}
