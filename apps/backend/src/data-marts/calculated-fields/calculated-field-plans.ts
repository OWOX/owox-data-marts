import type { DataMartSchemaField } from '../data-storage-types/data-mart-schema.type';
import type { CalculatedFieldPlan } from '../data-storage-types/utils/sql-clause-renderer';
import type { AggregationRule } from '../dto/schemas/aggregation-config.schema';
import {
  calculatedDependencyPlans,
  calculatedFieldLevelOf,
  calculatedFieldsOf,
} from './calculated-field.utils';
import { partitionCalculatedPlans } from './calculated-plan-grain';

/**
 * The `CalculatedFieldPlan` for each calculated field `names` mentions, in schema order.
 *
 * Shared by the flat projection, the group restriction and the predicate channel, because a second
 * construction would be a second place for the level fallback to be spelled, and those paths
 * differ by a GROUP BY.
 *
 * `aggregations` are the REPORT's own rules, and this is one of the two seats allowed to read
 * them for the grain question: a row-level field the report aggregates stops being a grouping
 * key, and every site downstream reads that off the plan.
 */
export function buildCalculatedFieldPlans(
  schemaFields: readonly DataMartSchemaField[],
  names: readonly string[],
  aggregations: AggregationRule[] | undefined
): CalculatedFieldPlan[] {
  const plans = calculatedFieldsOf(schemaFields)
    .filter(f => names.includes(f.name))
    .map(f => ({
      outputName: f.name,
      type: String(f.type),
      formula: f.calculated.formula,
      level: calculatedFieldLevelOf(f, schemaFields),
      // The formulas this one reads, carried so the renderer can substitute them — and
      // `undefined` rather than `[]` when there are none, so a plan is byte-identical to what it
      // was before this feature for every formula that reads only columns.
      dependencies: calculatedDependencyPlans(f, schemaFields),
      // The metric's own header source — see CalculatedFieldPlan. Empty strings normalize to
      // undefined so `alias || name` fallbacks downstream behave as they do for every other field.
      alias: f.alias?.trim() || undefined,
      description: f.description?.trim() || undefined,
    }));
  return partitionCalculatedPlans(plans, aggregations).all;
}
