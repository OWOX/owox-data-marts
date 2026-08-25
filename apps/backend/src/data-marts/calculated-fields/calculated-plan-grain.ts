import type { CalculatedMetricPlan } from '../data-storage-types/utils/sql-clause-renderer';
import type { AggregationRule } from '../dto/schemas/aggregation-config.schema';
import { aggregationFunctionsForColumn } from '../dto/schemas/aggregation-labels';
import { isAggregateLevel } from './formula-level';

/**
 * Whether a composed plan is one of the report's GROUPING KEYS — the question
 * `CalculatedMetricPlan.level` used to answer by proxy, until a report was allowed to aggregate a
 * row-level field (#6732 slice 3, spec §2). The two answers diverge there: a row-level field with
 * an aggregation rule on its name is STILL row-level (its formula does not aggregate), but it is no
 * longer a key the query groups by — `COUNT_DISTINCT(session_key)` grouped by `session_key` returns
 * 1 on every row, on every warehouse, with no error.
 *
 * The ONE seat for that reading, for the same reason `calculatedFieldLevelOf` is the one seat for
 * the level fallback: the eight sites that ask it (the outer renderer's GROUP BY push, the blended
 * builder's row-level plan list, the sleeve grain, the Totals restriction, both kept-groups
 * filters, the header builder, Totals eligibility) differ from one another by a GROUP BY rather
 * than by an error, so a second copy of the rule does not fail — it returns a plausible wrong
 * number.
 *
 * Deliberately takes only the PLAN: a caller must not be able to answer this from aggregation rules
 * it happens to hold. `renderKeptGroupsJoin` is why — it renders the report's grouping from an
 * empty rule list on purpose, so re-deriving the grain there would put an aggregated row-level
 * field back among the restriction's keys while the report itself had dropped it.
 */
export function isCalculatedGroupingKey(plan: CalculatedMetricPlan): boolean {
  return !isAggregateLevel(plan.level) && !plan.isAggregatedByReport;
}

export interface PartitionedCalculatedPlans {
  /** Every plan, in the order given, each carrying the verdict below. */
  all: CalculatedMetricPlan[];
  /** The plans that are grouping keys of the report. */
  dimensions: CalculatedMetricPlan[];
  /** The plans that are not: aggregate-level ones, and row-level ones the report aggregates. */
  metrics: CalculatedMetricPlan[];
}

/**
 * Decides each plan's grain against the report's OWN aggregation rules, and splits accordingly.
 *
 * Called from the two plan factories — `ReportSqlComposerService.buildCalculatedMetricPlans` and
 * `BlendedReportDataService.resolveBlendingDecision` — which are the only two places a plan the
 * report PROJECTS is built, and therefore the only two places that may read the rules for this
 * purpose (decision D9). Everything downstream asks the plan, through
 * {@link isCalculatedGroupingKey}.
 *
 * A third builder exists and deliberately does NOT come through here: `calculatedDependencyPlans`
 * (#6732) builds the plans a formula needs SUBSTITUTED into it. A dependency is not a column, so no
 * report aggregation can name it and `isAggregatedByReport` has no meaning for one — stamping it
 * would claim a rule that cannot exist. Its plans are reachable only from the substitution seat
 * (`sql-clause-renderer.ts`'s `expandCalculatedFormula`), which asks them for `outputName` and
 * `formula` and nothing else; they never reach {@link isCalculatedGroupingKey}. If a future caller
 * ever puts one where a grain is decided, an unstamped row-level dependency would read as a GROUP
 * BY key — a wrong number, not an error — which is what the guard in `renderAggregatedSelect`
 * stands for.
 *
 * A rule is recognized exactly as it is for an ordinary column, through
 * `aggregationFunctionsForColumn`, whose own contract already states the consequence: a non-empty
 * result means the column is an aggregated metric and never a GROUP BY key. A calculated field
 * follows that rule rather than a parallel one.
 *
 * An AGGREGATE-level plan is left alone: it already IS an aggregate, it is never a grouping key,
 * and no rule may name it (`AGGREGATION_ON_CALCULATED_METRIC`) — so marking it aggregated-by-report
 * would claim a report aggregation that does not exist.
 */
export function partitionCalculatedPlans(
  plans: readonly CalculatedMetricPlan[],
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
