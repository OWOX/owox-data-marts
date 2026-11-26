import type { DataMartSchemaField } from '../data-storage-types/data-mart-schema.type';
import { buildCalculatedFieldPlans } from '../calculated-fields/calculated-field-plans';
import { isCalculatedGroupingKey } from '../calculated-fields/calculated-plan-grain';
import { routeFilterClauses } from '../calculated-fields/filter-clause-routing';
import {
  isHavingFilterRule,
  isWhereFilterRule,
  type RoutedFilterRule,
} from '../dto/domain/filter-clause';
import type { RoutedGroupRestriction } from '../dto/domain/group-restriction';
import type { ReportLike } from '../dto/domain/report-like-read-plan';

/** Moves metric filters to a restriction at the `havingGroupBy` grain, else keeps the plan's. */
export function filtersAndRestrictionOf(
  report: ReportLike,
  schemaFields: readonly DataMartSchemaField[]
): { filters: RoutedFilterRule[]; groupRestriction?: RoutedGroupRestriction } {
  const routed = routeFilterClauses(report.filterConfig ?? undefined, schemaFields);
  const ownRestriction = 'groupRestriction' in report ? report.groupRestriction : undefined;
  const grain = 'havingGroupBy' in report ? report.havingGroupBy : undefined;
  if (!grain) return { filters: routed, groupRestriction: ownRestriction };
  if (ownRestriction) {
    throw new Error('A read plan cannot carry both havingGroupBy and groupRestriction');
  }

  const having = routed.filter(isHavingFilterRule);
  // Same as the Totals producer: no metric filter, no restriction.
  if (having.length === 0) return { filters: routed };
  // No aggregation rules: a key of the grain stays a key even when the read aggregates it.
  const calculatedDimensions = buildCalculatedFieldPlans(
    schemaFields,
    grain.column,
    undefined
  ).filter(isCalculatedGroupingKey);
  const calculatedHavingMetrics = buildCalculatedFieldPlans(
    schemaFields,
    having.map(rule => rule.column),
    report.aggregationConfig ?? undefined
  );
  return {
    filters: routed.filter(isWhereFilterRule),
    groupRestriction: {
      dimensions: grain.column,
      calculatedDimensions: calculatedDimensions.length > 0 ? calculatedDimensions : undefined,
      having,
      calculatedHavingMetrics:
        calculatedHavingMetrics.length > 0 ? calculatedHavingMetrics : undefined,
      dateTruncs: grain.dateTrunc?.length ? grain.dateTrunc : undefined,
    },
  };
}
