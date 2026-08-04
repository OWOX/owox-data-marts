import { FilterRule } from '../../dto/schemas/filter-config.schema';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { effectiveComparisonType } from '../field-aggregation';
import { BlendedQueryContext } from '../interfaces/blended-query-builder.interface';
import { ColumnTypeResolver } from '../utils/sql-clause-renderer';

export interface PartitionedBlendedFilters {
  /** Pre-join rules per chain CTE, already rewritten to the chain's own raw column names. */
  preJoinByCte: ReadonlyMap<string, FilterRule[]>;
  /** Everything applied to the joined result (WHERE, plus HAVING rules carrying a function). */
  postJoinFilters: FilterRule[];
  /** The cast type for any rule from either set — pre-join casts against the RAW source type. */
  resolveColumnType: ColumnTypeResolver;
}

/**
 * Splits a report's filters into the pre-join set (pushed down into each joined data mart's
 * `<alias>_raw` CTE, so the mart is narrowed before it is joined) and the post-join set
 * (applied to the joined result), and returns the type resolver both need for value casts.
 *
 * Throws when a pre-join rule names a column that is not a resolvable blended field of this
 * schema: the validator must reject that before the builder ever sees it, so reaching here is
 * an invariant violation, not user error.
 */
export function partitionBlendedFilters(
  context: BlendedQueryContext,
  storageType: DataStorageType
): PartitionedBlendedFilters {
  const validCteNames = new Set(context.chains.map(c => c.cteName));
  const preJoinByCte = new Map<string, FilterRule[]>();
  const postJoinFilters: FilterRule[] = [];
  // Maps each resolved pre-join rule object (identity key) to its column type,
  // so resolveColumnType can serve pre-join casts without a separate type map.
  const preJoinTypeByRule = new Map<FilterRule, string | undefined>();

  for (const rule of context.filters ?? []) {
    if (rule.placement !== 'pre-join') {
      postJoinFilters.push(rule);
      continue;
    }
    if (rule.function) {
      // A pre-join rule carrying a function has nowhere to run: the raw CTE renders WHERE, and
      // `renderWhere` drops function-carrying rules, while HAVING only exists post-join. It
      // would silently constrain nothing and return more rows than asked for. The validator
      // rejects the combination (HAVING_FILTER_INVALID_PLACEMENT), so reaching here is an
      // invariant violation — the same class this function already throws on below.
      throw new Error(
        `buildBlendedQuery: pre-join filter column='${rule.column}' carries function=` +
          `'${rule.function}' — a post-aggregation constraint cannot be pushed pre-join`
      );
    }
    const f = context.fieldIndex?.get(rule.column);
    if (!f) {
      throw new Error(
        `buildBlendedQuery: pre-join filter column='${rule.column}' is an unresolved blended column ` +
          `(not present in the field index for this schema)`
      );
    }
    if (!validCteNames.has(f.cteName)) {
      throw new Error(
        `buildBlendedQuery: pre-join filter column='${rule.column}' ` +
          `resolves to cteName='${f.cteName}' which is not in any chain`
      );
    }
    const internal: FilterRule = { ...rule, column: f.originalFieldName };
    // Pre-join slices cast against the RAW source type (the raw column pre-dedup), not the
    // dedup effective `type` — e.g. a raw DATE deduped COUNT_DISTINCT still casts as DATE.
    preJoinTypeByRule.set(internal, f.sourceFieldType ?? f.type);
    const list = preJoinByCte.get(f.cteName) ?? [];
    list.push(internal);
    preJoinByCte.set(f.cteName, list);
  }

  const resolveColumnType: ColumnTypeResolver = rule => {
    const raw = preJoinTypeByRule.has(rule)
      ? preJoinTypeByRule.get(rule)
      : context.columnTypes?.postJoin?.get(rule.column);
    // A post-join HAVING rule (carries a function) compares against the aggregate's
    // value, so cast to the aggregate's effective type rather than the raw field type.
    return effectiveComparisonType(raw, rule, storageType);
  };

  return { preJoinByCte, postJoinFilters, resolveColumnType };
}
