import { FilterRule } from '../../dto/schemas/filter-config.schema';
import { SortRule } from '../../dto/schemas/sort-config.schema';

// Array order MUST match placeholder order in the SQL: positional dialects
// (Athena `?`) bind by position and ignore `name`.
export interface SqlParameter {
  name: string;
  value: string | number | boolean | null;
}

export interface RenderedClause {
  sql: string;
  params: SqlParameter[];
}

/**
 * Returns the SQL fragment for a column reference — fully quoted and, when
 * needed, prefixed with a CTE alias. The renderer cannot derive the prefix
 * from the column name alone, so the caller supplies one.
 */
export type ColumnRefResolver = (column: string) => string;

/**
 * Resolves the storage field type for a filter rule's column. Positional dialects
 * (Athena) use it to cast date/time placeholders so a varchar literal is not
 * compared against a DATE/TIMESTAMP column. Returns undefined when unknown — the
 * renderer then emits a plain placeholder.
 */
export type ColumnTypeResolver = (rule: FilterRule) => string | undefined;

// Matches BigQuery named-parameter rules — fail fast instead of waiting for BQ to reject it.
const PARAM_PREFIX_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export abstract class SqlClauseRenderer {
  protected abstract quoteIdentifier(name: string): string;
  protected abstract renderFilterFragment(
    rule: FilterRule,
    paramName: string,
    columnRef: string,
    columnType?: string
  ): RenderedClause;

  private resolverOrFallback(qualifyColumn: ColumnRefResolver | undefined): ColumnRefResolver {
    return qualifyColumn ?? (c => this.quoteIdentifier(c));
  }

  renderWhere(
    filters: FilterRule[],
    qualifyColumn?: ColumnRefResolver,
    paramPrefix = 'p',
    resolveColumnType?: ColumnTypeResolver
  ): RenderedClause {
    if (!filters.length) return { sql: '', params: [] };
    if (!PARAM_PREFIX_PATTERN.test(paramPrefix)) {
      throw new Error(
        `renderWhere: invalid paramPrefix '${paramPrefix}' — must match ${PARAM_PREFIX_PATTERN.source}`
      );
    }
    const resolve = this.resolverOrFallback(qualifyColumn);
    const fragments: string[] = [];
    const params: SqlParameter[] = [];
    let nextIndex = 0;
    for (const rule of filters) {
      const paramName = `${paramPrefix}${nextIndex}`;
      const out = this.renderFilterFragment(
        rule,
        paramName,
        resolve(rule.column),
        resolveColumnType?.(rule)
      );
      this.validateFragment(out);
      fragments.push(out.sql);
      params.push(...out.params);
      nextIndex += out.params.length;
    }
    return { sql: `\nWHERE ${fragments.join(' AND ')}`, params };
  }

  renderOrderBy(sort: SortRule[], qualifyColumn?: ColumnRefResolver): RenderedClause {
    if (!sort.length) return { sql: '', params: [] };
    const resolve = this.resolverOrFallback(qualifyColumn);
    const parts = sort.map(r => `${resolve(r.column)} ${r.direction.toUpperCase()}`);
    return { sql: `\nORDER BY ${parts.join(', ')}`, params: [] };
  }

  renderLimit(limit: number | null | undefined): RenderedClause {
    if (limit == null) return { sql: '', params: [] };
    if (!Number.isInteger(limit) || limit < 0) {
      throw new Error(`Invalid LIMIT value: ${String(limit)}`);
    }
    return { sql: `\nLIMIT ${limit}`, params: [] };
  }

  /**
   * Hook for a dialect-specific invariant check on a freshly rendered fragment.
   * Default: no-op. Positional dialects (Athena `?`) override this to assert that
   * the placeholder count equals params.length — positional binding silently
   * misaligns every subsequent value when a fragment emits the wrong count, so
   * we fail fast at render time instead of producing a subtly wrong query.
   */
  protected validateFragment(_clause: RenderedClause): void {
    // no-op by default; named-parameter dialects (BigQuery `@name`) may reuse a
    // name across placeholders, so occurrence count need not equal params.length.
  }

  protected nextParamName(paramName: string): string {
    const match = paramName.match(/^(.*?)(\d+)$/);
    if (!match) {
      throw new Error(`Cannot derive next param name from "${paramName}"`);
    }
    return `${match[1]}${Number(match[2]) + 1}`;
  }
}
