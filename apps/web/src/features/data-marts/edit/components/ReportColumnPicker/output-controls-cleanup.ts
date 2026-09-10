import type {
  AggregationRule,
  FilterRule,
  OutputConfig,
  OutputConfigKey,
  ReportAggregateFunction,
} from '../../../shared/types/output-config';

/**
 * What the picker knows about this Data Mart's calculated fields, by name. Both sets are read by
 * the sort decision below: a formula renders as a SELECT alias, so it is sortable only while
 * selected, and an AGGREGATE-level one turns the whole query into a GROUP BY on its own.
 */
export interface CalculatedFieldNames {
  /** Every calculated field of the main Data Mart, at either level. */
  all: ReadonlySet<string>;
  /** The AGGREGATE-level subset. */
  aggregate: ReadonlySet<string>;
}

/**
 * Everything a sort rule is resolved against. The picker builds one per decision, so each set
 * reflects the report as it is about to be saved, not as it was rendered.
 */
export interface SortResolutionContext {
  /** The selection the rules must resolve against — for a deselect, the selection AFTER it. */
  selectedNames: ReadonlySet<string>;
  /** False when the report projects the implicit "all native columns" (the picker's value is null). */
  hasExplicitColumns: boolean;
  /**
   * Every column the schema offers: native paths plus every non-hidden blended field, INCLUDING
   * fields of sources excluded from reporting (they still resolve on the backend).
   */
  knownNames: ReadonlySet<string>;
  calculatedFields: CalculatedFieldNames;
  /**
   * 'Unique Count' plus '<aliasPath>__unique_count' for every available joined source — names
   * the blended builder treats as its own aliases when unselected.
   */
  uniqueCountOutputNames: ReadonlySet<string>;
  /** The enabled Unique Count metrics the picker offers as sort targets (synthetic columns). */
  syntheticSortNames: ReadonlySet<string>;
  /**
   * Calculated fields of JOINED Data Marts. The backend refuses a report surface naming one on
   * every path (`JOINED_CALCULATED_FIELD_UNSUPPORTED`), selected or not, so a sort on one never
   * resolves. Optional: a context built where the join tree is unknown reads as none.
   */
  joinedCalculatedNames?: ReadonlySet<string>;
}

/** The report as it was before an edit — what a rule that the edit broke used to resolve against. */
export interface SortResolutionBefore {
  config: OutputConfig;
  ctx: SortResolutionContext;
}

/**
 * Whether the report renders as a GROUP BY query — the same condition the backend's builders
 * branch on: an aggregation, a date bucket, a Unique Count, or an AGGREGATE-level calculated
 * field that is selected or filtered on (it IS an aggregate, so it forces the shape with no rule
 * in sight). Decides what a sort may name: a grouped query resolves ORDER BY through its output
 * aliases, so a sort there can only name a printed column, while an ungrouped one with an
 * explicit projection can order by any column of the schema, exactly like a filter.
 */
export function isAggregatedShape(
  config: OutputConfig,
  selectedNames: ReadonlySet<string>,
  aggregateCalculatedNames: ReadonlySet<string>
): boolean {
  if (
    config.aggregationConfig.length > 0 ||
    config.dateTruncConfig.length > 0 ||
    config.uniqueCountConfig.length > 0
  ) {
    return true;
  }
  for (const name of aggregateCalculatedNames) {
    if (selectedNames.has(name)) return true;
    if (config.filterConfig.some(rule => rule.column === name)) return true;
  }
  return false;
}

/**
 * Whether a sort on `column` resolves in the report's shape — the backend's sort validation,
 * mirrored, so the picker never offers (or keeps) a sort the save would refuse.
 *
 * A synthetic Unique Count metric is an outer SELECT alias whenever it is enabled, so it resolves
 * in every shape. A name the schema no longer offers resolves nowhere. From there the shape
 * decides. With the implicit projection (`SELECT *` over the native columns) a projected column
 * resolves unless the projection is metrics-only — an aggregation or a Unique Count with no
 * column list prints nothing but metrics — which is the backend's own reading of that shape (the
 * other grouped variants of an implicit projection are refused on save for wanting a column
 * list, and their sort verdict is the native set). With an explicit projection a printed column
 * always resolves; a grouped query resolves ORDER BY through its output aliases, so an unprinted
 * column does not. An
 * ungrouped one resolves ORDER BY against the source row, so any schema column does, exactly
 * like a filter — with two exceptions that render as names the query does not have: a calculated
 * field (a SELECT alias planned only when selected) and a real column owning a Unique Count
 * output name (the blended builder strips every unselected such name from the columns it carries
 * into its CTEs, taking it for the synthetic alias).
 */
export function isSortResolvable(
  column: string,
  config: OutputConfig,
  ctx: SortResolutionContext
): boolean {
  if (ctx.syntheticSortNames.has(column)) return true;
  if (!ctx.knownNames.has(column)) return false;
  if (ctx.joinedCalculatedNames?.has(column)) return false;

  if (!ctx.hasExplicitColumns) {
    const metricsOnly = config.aggregationConfig.length > 0 || config.uniqueCountConfig.length > 0;
    return !metricsOnly && ctx.selectedNames.has(column);
  }
  const grouped = isAggregatedShape(config, ctx.selectedNames, ctx.calculatedFields.aggregate);
  if (ctx.selectedNames.has(column)) return true;
  if (grouped) return false;
  return !ctx.calculatedFields.all.has(column) && !ctx.uniqueCountOutputNames.has(column);
}

/**
 * `config` minus every sort rule that THIS edit broke: one that resolved `before` the edit and
 * does not resolve after it. A rule that was already unresolvable is left alone — it is not this
 * edit's doing, the Sort section shows it struck through with its Remove button, and a stored
 * rule the editor deliberately keeps (a sort on an excluded source's Unique Count, which the
 * backend still accepts) must not vanish under an unrelated click. Without `before`, every rule
 * that cannot resolve goes.
 *
 * Returns the same config object when nothing changed, so a consumer can tell "nothing to write
 * back" by identity; `changed` names `sortConfig` exactly when a rule went.
 */
export function withoutUnresolvableSorts(
  config: OutputConfig,
  ctx: SortResolutionContext,
  before?: SortResolutionBefore
): { config: OutputConfig; changed: OutputConfigKey[] } {
  const brokenByThisEdit = (column: string): boolean =>
    !isSortResolvable(column, config, ctx) &&
    (before === undefined || isSortResolvable(column, before.config, before.ctx));
  const sortConfig = config.sortConfig.filter(rule => !brokenByThisEdit(rule.column));
  if (sortConfig.length === config.sortConfig.length) return { config, changed: [] };
  return { config: { ...config, sortConfig }, changed: ['sortConfig'] };
}

/** The identity a HAVING rule must share with an aggregation to filter its value. */
function aggregatedPairKey(rule: Pick<AggregationRule, 'column' | 'function'>): string {
  // A separator no column name carries, so `a` + `SUM` never collides with a column named `a SUM`.
  return `${rule.column}␟${rule.function}`;
}

/** A rule carrying a `function` filters the aggregated value (HAVING), not the raw rows. */
function isHavingRule(
  rule: FilterRule
): rule is FilterRule & { function: ReportAggregateFunction } {
  return rule.function !== undefined;
}

/**
 * `filters` minus every HAVING rule whose aggregation THIS edit removed: its (column, function)
 * pair was in `aggregationsBefore` and is not in `aggregationsAfter`. A HAVING is a condition on
 * `SUM(revenue)`, not on `revenue`, and the backend refuses one whose pair names no aggregation
 * of the report — so once the aggregation goes the filter has nothing to apply to. A HAVING that
 * was already orphaned is not this edit's to remove and stays. Row filters and slices are never
 * touched: a filter on raw rows holds whether or not its column is printed.
 */
function withoutHavingFiltersLeftBy(
  filters: FilterRule[],
  aggregationsBefore: readonly AggregationRule[],
  aggregationsAfter: readonly AggregationRule[]
): FilterRule[] {
  const before = new Set(aggregationsBefore.map(aggregatedPairKey));
  const after = new Set(aggregationsAfter.map(aggregatedPairKey));
  return filters.filter(rule => {
    if (!isHavingRule(rule)) return true;
    const pair = aggregatedPairKey(rule);
    return !(before.has(pair) && !after.has(pair));
  });
}

/**
 * `after` minus every HAVING filter bound to an aggregation that `before` had and `after` has
 * not — the aggregation edits made from a row's aggregation menu or the Aggregations panel.
 * Returns the same config object when no such filter went.
 */
export function withoutHavingFiltersOrphanedBy(
  before: OutputConfig,
  after: OutputConfig
): { config: OutputConfig; changed: OutputConfigKey[] } {
  const filterConfig = withoutHavingFiltersLeftBy(
    after.filterConfig,
    before.aggregationConfig,
    after.aggregationConfig
  );
  if (filterConfig.length === after.filterConfig.length) return { config: after, changed: [] };
  return { config: { ...after, filterConfig }, changed: ['filterConfig'] };
}

/**
 * The output config after the user unchecks `removed` from the selection; `ctx.selectedNames` is
 * the selection AFTER the deselect.
 *
 * Aggregations and date buckets on an unchecked column go with it: neither can apply to a column
 * the report does not print (the backend refuses the save), and leaving them behind is what used
 * to fail the next save and every scheduled run with a rule the row no longer showed. A HAVING
 * filter goes with the aggregation it filters: it is a condition on `SUM(revenue)`, not on
 * `revenue`, and the backend refuses a HAVING whose (column, function) pair names no aggregation
 * of the report — so once the aggregation is pruned the filter has nothing to apply to. Row
 * filters, slices, the limit and the Unique Count selection are untouched — a filter on raw rows
 * holds whether or not its column is printed.
 *
 * Sorts are then re-resolved against the PRUNED config, since unchecking the only aggregated
 * column may be exactly what makes the query ungrouped: a sort survives when it still resolves in
 * that shape (the way a filter on an unselected column does) and goes when it cannot — the column
 * is gone from the schema (a disconnected row being unchecked takes every rule on it), the
 * report is still a GROUP BY, or the column is one that only resolves while selected. A sort on
 * an UNCHECKED column goes whenever it cannot resolve; a sort on any other column goes only when
 * this very uncheck broke it (`withoutUnresolvableSorts`), so a rule that was already orphaned
 * stays in plain view for the user to deal with.
 *
 * `before` is the report as rendered before the uncheck; without it, the previous selection is
 * taken to be the next one plus `removed`, against the same config.
 *
 * `changed` names exactly the keys rewritten, so a consumer that stores the config per key can
 * write those back and nothing else; the same config object comes back when nothing changed.
 */
export function pruneRulesForDeselectedColumns(
  config: OutputConfig,
  removed: ReadonlySet<string>,
  ctx: SortResolutionContext,
  before: SortResolutionBefore = {
    config,
    ctx: { ...ctx, selectedNames: new Set([...ctx.selectedNames, ...removed]) },
  }
): { config: OutputConfig; changed: OutputConfigKey[] } {
  if (removed.size === 0) return { config, changed: [] };

  const aggregationConfig = config.aggregationConfig.filter(rule => !removed.has(rule.column));
  const dateTruncConfig = config.dateTruncConfig.filter(rule => !removed.has(rule.column));
  const filterConfig = withoutHavingFiltersLeftBy(
    config.filterConfig,
    config.aggregationConfig,
    aggregationConfig
  );

  const changed: OutputConfigKey[] = [];
  if (aggregationConfig.length !== config.aggregationConfig.length)
    changed.push('aggregationConfig');
  if (dateTruncConfig.length !== config.dateTruncConfig.length) changed.push('dateTruncConfig');
  if (filterConfig.length !== config.filterConfig.length) changed.push('filterConfig');

  const pruned: OutputConfig =
    changed.length === 0 ? config : { ...config, aggregationConfig, dateTruncConfig, filterConfig };
  const sortConfig = pruned.sortConfig.filter(rule => {
    if (isSortResolvable(rule.column, pruned, ctx)) return true;
    if (removed.has(rule.column)) return false;
    return !isSortResolvable(rule.column, before.config, before.ctx);
  });
  if (sortConfig.length !== pruned.sortConfig.length) changed.push('sortConfig');

  return changed.length === 0
    ? { config, changed }
    : { config: { ...pruned, sortConfig }, changed };
}
