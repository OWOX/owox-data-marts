import type { CalculatedFieldPlan } from '../data-storage-types/utils/sql-clause-renderer';
import type { AggregationRule } from '../dto/schemas/aggregation-config.schema';
import { aggregationFunctionsForColumn } from '../dto/schemas/aggregation-labels';
import { isAggregateLevel } from './formula-level';

/**
 * Whether a composed plan is one of the report's GROUPING KEYS. Not the same question as `level`:
 * a row-level field carrying an aggregation rule is STILL row-level, since its formula does not
 * aggregate, but it is no longer a key — `COUNT_DISTINCT(session_key)` grouped by `session_key`
 * returns 1 on every row, on every warehouse, with no error.
 *
 * The ONE seat for that reading, because the eight sites that ask it differ from one another by a
 * GROUP BY rather than by an error: a second copy does not fail, it returns a plausible wrong
 * number.
 *
 * Takes only the PLAN, so a caller cannot answer it from aggregation rules it happens to hold.
 * `renderKeptGroupsJoin` is why — it renders the grouping from an EMPTY rule list on purpose, and
 * re-deriving there would put an aggregated row-level field back among the restriction's keys.
 */
export function isCalculatedGroupingKey(plan: CalculatedFieldPlan): boolean {
  return !isAggregateLevel(plan.level) && !plan.isAggregatedByReport;
}

export interface PartitionedCalculatedPlans {
  /** Every plan, in the order given, each carrying the verdict below. */
  all: CalculatedFieldPlan[];
  /** The plans that are grouping keys of the report. */
  dimensions: CalculatedFieldPlan[];
  /** The plans that are not: aggregate-level ones, and row-level ones the report aggregates. */
  metrics: CalculatedFieldPlan[];
}

/**
 * Decides each plan's grain against the report's OWN aggregation rules, and splits accordingly.
 *
 * Called from the two plan factories, the only places a plan the report PROJECTS is built and
 * therefore the only ones that may read the rules for this purpose. Everything downstream asks the
 * plan, through {@link isCalculatedGroupingKey}.
 *
 * `calculatedDependencyPlans` deliberately does NOT come through here: a dependency is not a
 * column, so no report aggregation can name it and stamping one would claim a rule that cannot
 * exist. Its plans reach the substitution seat only. Should a future caller put one where a grain
 * is decided, an unstamped row-level dependency reads as a GROUP BY key — a wrong number, not an
 * error — which is what the guard in `renderAggregatedSelect` stands for.
 *
 * An AGGREGATE-level plan is left alone: it already IS an aggregate and no rule may name it, so
 * marking it aggregated-by-report would claim an aggregation that does not exist.
 */
export function partitionCalculatedPlans(
  plans: readonly CalculatedFieldPlan[],
  aggregations: AggregationRule[] | undefined
): PartitionedCalculatedPlans {
  const rules = aggregations ?? [];
  const all = plans.map(plan =>
    isAggregateLevel(plan.level) ||
    aggregationFunctionsForColumn(rules, plan.outputName).length === 0
      ? plan
      : { ...plan, isAggregatedByReport: true }
  );
  return {
    all,
    dimensions: all.filter(isCalculatedGroupingKey),
    metrics: all.filter(plan => !isCalculatedGroupingKey(plan)),
  };
}
