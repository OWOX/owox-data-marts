import { FilterRule } from '../../dto/schemas/filter-config.schema';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { effectiveComparisonType } from '../field-aggregation';
import { BlendedQueryContext } from '../interfaces/blended-query-builder.interface';
import { ColumnTypeResolver, declaredTypeByCalculatedField } from '../utils/sql-clause-renderer';
import { isHavingFilterRule } from '../../dto/domain/filter-clause';

export interface PartitionedBlendedFilters {
  /** Pre-join rules per chain CTE, already rewritten to the chain's own raw column names. */
  preJoinByCte: ReadonlyMap<string, FilterRule[]>;
  /** Everything applied to the joined result — both clauses; the split is `filterClauseOf`. */
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
    if (isHavingFilterRule(rule)) {
      // A pre-join HAVING rule has nowhere to run: the raw CTE renders WHERE, and `renderWhere`
      // drops it, while HAVING only exists post-join. It would silently constrain nothing and
      // return more rows than asked for. The validator rejects the combination
      // (HAVING_FILTER_INVALID_PLACEMENT), so reaching here is an invariant violation — the same
      // class this function already throws on below. Read off the rule, because an
      // aggregate-level Calculated Field's rule carries no `function` and would slip past.
      throw new Error(
        `buildBlendedQuery: pre-join filter column='${rule.column}'` +
          (rule.function ? ` carries function='${rule.function}'` : ' filters an aggregate') +
          ' — a post-aggregation constraint cannot be pushed pre-join'
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

  // A Calculated Field has no warehouse column, so `postJoin` can never hold one: its DECLARED type
  // reaches the filter path through this same resolver rather than a parallel one.
  // Both lists, because a filter may name a field the report also selects.
  const declaredCalculatedTypes = declaredTypeByCalculatedField(
    context.calculatedFields,
    context.calculatedFilterMetrics
  );

  const resolveColumnType: ColumnTypeResolver = rule => {
    const raw = preJoinTypeByRule.has(rule)
      ? preJoinTypeByRule.get(rule)
      : (declaredCalculatedTypes.get(rule.column) ??
        context.columnTypes?.postJoin?.get(rule.column));
    // A post-join HAVING rule compares against the aggregate's value, so cast to the aggregate's
    // effective type rather than the raw field type. Still keyed on `rule.function` inside
    // `effectiveComparisonType`, and correctly so: that is the aggregate whose result type is
    // being widened, not the clause. An aggregate-level Calculated Field has none to widen — the
    // declaration above is what its comparison imposes instead.
    return effectiveComparisonType(raw, rule, storageType);
  };

  return { preJoinByCte, postJoinFilters, resolveColumnType };
}
