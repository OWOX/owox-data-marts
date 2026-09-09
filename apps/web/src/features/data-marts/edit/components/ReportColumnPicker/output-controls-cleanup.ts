import type { OutputConfig, OutputConfigKey } from '../../../shared/types/output-config';

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
 * The output config after the user unchecks `removed` from the selection.
 *
 * Aggregations and date buckets on an unchecked column go with it: neither can apply to a column
 * the report does not print (the backend refuses the save), and leaving them behind is what used
 * to fail the next save and every scheduled run with a rule the row no longer showed. Filters,
 * slices, the limit and the Unique Count selection are untouched — a filter holds whether or not
 * its column is printed.
 *
 * A sort on the column goes only when it can no longer resolve: the report is still a GROUP BY
 * after the pruning (the shape is re-read from the config WITHOUT the pruned rules, since
 * unchecking the only aggregated column may be exactly what makes the query ungrouped), or the
 * column is a calculated field (sortable only while selected). Otherwise the sort stays, valid,
 * the way a filter on an unselected column is.
 *
 * `changed` names exactly the keys rewritten, so a consumer that stores the config per key can
 * write those back and nothing else.
 */
export function pruneRulesForDeselectedColumns(
  config: OutputConfig,
  removed: ReadonlySet<string>,
  context: {
    /** The selection AFTER the deselect. */
    selectedNames: ReadonlySet<string>;
    calculatedFields: CalculatedFieldNames;
  }
): { config: OutputConfig; changed: OutputConfigKey[] } {
  if (removed.size === 0) return { config, changed: [] };

  const aggregationConfig = config.aggregationConfig.filter(rule => !removed.has(rule.column));
  const dateTruncConfig = config.dateTruncConfig.filter(rule => !removed.has(rule.column));
  const pruned: OutputConfig = { ...config, aggregationConfig, dateTruncConfig };

  const sortSurvivesDeselect = !isAggregatedShape(
    pruned,
    context.selectedNames,
    context.calculatedFields.aggregate
  );
  const sortConfig = config.sortConfig.filter(
    rule =>
      !removed.has(rule.column) ||
      (sortSurvivesDeselect && !context.calculatedFields.all.has(rule.column))
  );

  const changed: OutputConfigKey[] = [];
  if (aggregationConfig.length !== config.aggregationConfig.length)
    changed.push('aggregationConfig');
  if (dateTruncConfig.length !== config.dateTruncConfig.length) changed.push('dateTruncConfig');
  if (sortConfig.length !== config.sortConfig.length) changed.push('sortConfig');
  if (changed.length === 0) return { config, changed };

  return { config: { ...pruned, sortConfig }, changed };
}
