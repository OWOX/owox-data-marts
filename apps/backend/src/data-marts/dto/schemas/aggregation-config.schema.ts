import { z } from 'zod';
import { REPORT_AGGREGATE_FUNCTIONS } from './aggregate-function.schema';

/**
 * A single aggregation applied to an output column. Group-by is implied: any
 * projected column that has no aggregation rule becomes a grouping key (see
 * `SqlClauseRenderer.renderAggregatedSelect`). Report-level for now — data-mart-level
 * governance (allowed functions per field, dimension/metric role) is a later slice.
 */
export const AggregationRuleSchema = z.object({
  column: z.string().min(1),
  function: z.enum(REPORT_AGGREGATE_FUNCTIONS),
});

export const AggregationConfigSchema = z.array(AggregationRuleSchema).nullable();

export type AggregationRule = z.infer<typeof AggregationRuleSchema>;
export type AggregationConfig = z.infer<typeof AggregationConfigSchema>;
