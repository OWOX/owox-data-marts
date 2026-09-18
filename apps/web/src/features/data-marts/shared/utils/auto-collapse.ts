import type { NativeField, ReportAggregateFunction } from '../types/relationship.types';
import type { OutputConfig } from '../types/output-config';
import { categorize, pickAutoAggregation, resolveFieldGovernance } from './aggregation-governance';
import { isRowLevelCalculatedField } from './calculated-field-level';
import { flattenNativeFields } from './flatten-native-fields';

export type AutoCollapseSkipReason =
  | 'analyst-aggregated'
  | 'no-explicit-projection'
  | 'non-groupable-column'
  | 'unresolvable-column'
  | 'no-allowed-aggregation'
  | 'calculated-not-liftable'
  | 'sort-outside-projection';

export type AutoCollapsePlan =
  | { kind: 'none'; reason: AutoCollapseSkipReason }
  | { kind: 'distinct' }
  | { kind: 'aggregate'; aggregations: { column: string; function: ReportAggregateFunction }[] };

/**
 * Web mirror of the backend `auto-collapse.resolver.ts`. The picker no longer merely previews from
 * this — what it returns is WRITTEN into the report's `aggregationConfig` and saved with it — so
 * the two must agree case for case, including the ORDER of the checks below.
 *
 * Which makes the two directions of divergence unequal, and only one of them tolerable:
 *
 * - NARROWER than the server (the lift case below) writes nothing, and the server still collapses
 *   at run time. The report is delivered correctly; the editor merely said less than it could.
 * - WIDER than the server writes a rule the server would never have chosen, into a report that
 *   then stores it. That is the direction to keep this file out of: the checks here are not
 *   structurally the same as the backend's — it resolves governance against the full schema and
 *   walks `collectSchemaFieldPathDescriptors`, while this walks `flattenNativeFields` — so a new
 *   case has to be added on the narrow side or on both, never here alone.
 *
 * Pure and total, and aborts as a whole: a half-collapsed report would let the surviving
 * duplicates multiply whatever was aggregated.
 *
 * The one divergence known today is narrow: the backend can lift a row-level calculated metric to
 * group level behind a distributivity guard, and that guard is server-only. Such a field reads
 * here as `calculated-not-liftable` even when the server would lift it. Do not close this gap by
 * porting the expression analysis to the client.
 *
 * An aggregate-level calculated field aborts on both sides, of either role, before governance is
 * resolved; a row-level one of dimension role is an ordinary grouping key on both sides.
 */
export function resolveAutoCollapse(
  nativeFields: readonly NativeField[],
  columnConfig: string[] | null,
  outputConfig: OutputConfig | undefined
): AutoCollapsePlan {
  if (!columnConfig?.length) return { kind: 'none', reason: 'no-explicit-projection' };

  const byName = new Map(flattenNativeFields(nativeFields).map(f => [f.name, f]));

  // Each of these already puts the query on the aggregated branch. The filter trigger is the one
  // no projection walk can see.
  if (
    (outputConfig?.aggregationConfig.length ?? 0) > 0 ||
    (outputConfig?.dateTruncConfig.length ?? 0) > 0 ||
    (outputConfig?.uniqueCountConfig.length ?? 0) > 0 ||
    (outputConfig?.filterConfig ?? []).some(rule => {
      const field = byName.get(rule.column);
      return !!field?.calculated && !isRowLevelCalculatedField(field.calculated);
    })
  ) {
    return { kind: 'none', reason: 'analyst-aggregated' };
  }

  // A sort on an unprojected column is valid while ungrouped and invalid once collapsed, so the
  // server refuses the whole collapse rather than degrading the sort — and so must the ghost.
  const projectedColumns = new Set(columnConfig);
  if ((outputConfig?.sortConfig ?? []).some(rule => !projectedColumns.has(rule.column))) {
    return { kind: 'none', reason: 'sort-outside-projection' };
  }

  const aggregations: { column: string; function: ReportAggregateFunction }[] = [];

  for (const name of columnConfig) {
    const field = byName.get(name);
    // A joined column, or one the schema has since lost: its type is unreadable here, so a
    // dimension cannot be told from a metric. Mirrors the server, which refuses rather than group
    // by something whose duplicates carry value.
    if (!field?.type) return { kind: 'none', reason: 'unresolvable-column' };

    if (categorize(field.type) === 'other') {
      return { kind: 'none', reason: 'non-groupable-column' };
    }

    // Already aggregated by its own formula. Checked before governance, as on the server.
    if (field.calculated && !isRowLevelCalculatedField(field.calculated)) {
      return { kind: 'none', reason: 'analyst-aggregated' };
    }

    const governance = resolveFieldGovernance(field.type, {
      aggregationRole: field.aggregationRole,
      allowedAggregations: field.allowedAggregations,
    });
    // A dimension is a GROUP BY key, and that is as true of a row-level calculated one (e.g.
    // CONCAT) as of a native column — it collapses correctly by being grouped by.
    if (governance.role !== 'metric') continue;

    // Only a ROW-level calculated field that resolves to METRIC role can still be here (the
    // aggregate-level branch above already returned). The backend may LIFT this formula to group
    // level; this resolver cannot and must not try — see the divergence note above.
    if (field.calculated) {
      return { kind: 'none', reason: 'calculated-not-liftable' };
    }

    const fn = pickAutoAggregation(field.type, governance.allowedAggregations);
    if (!fn) return { kind: 'none', reason: 'no-allowed-aggregation' };
    aggregations.push({ column: name, function: fn });
  }

  // No metric in the projection: collapsing is exactly SELECT DISTINCT, which cannot change a
  // value — the one case that needs no choice made on the analyst's behalf.
  return aggregations.length === 0 ? { kind: 'distinct' } : { kind: 'aggregate', aggregations };
}

/** The per-column functions a row renderer asks for; empty for every non-`aggregate` plan. */
/** Shared, so a plan that predicts nothing hands back the same object every time. */
const NO_AUTO_AGGREGATIONS: ReadonlyMap<string, ReportAggregateFunction> = new Map();

export function autoAggregationByColumn(
  plan: AutoCollapsePlan
): ReadonlyMap<string, ReportAggregateFunction> {
  if (plan.kind !== 'aggregate') return NO_AUTO_AGGREGATIONS;
  return new Map(plan.aggregations.map(rule => [rule.column, rule.function]));
}
