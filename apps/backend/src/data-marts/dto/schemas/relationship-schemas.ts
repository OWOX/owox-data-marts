import { z } from 'zod';

export const AGGREGATE_FUNCTIONS = [
  'STRING_AGG',
  'MAX',
  'MIN',
  'SUM',
  'COUNT',
  'COUNT_DISTINCT',
  'ANY_VALUE',
] as const;
export type AggregateFunction = (typeof AGGREGATE_FUNCTIONS)[number];

export const JoinConditionSchema = z.object({
  sourceFieldName: z.string().min(1),
  targetFieldName: z.string().min(1),
});
export type JoinCondition = z.infer<typeof JoinConditionSchema>;
export const JoinConditionsSchema = z.array(JoinConditionSchema);
export const JoinConditionsUpdateSchema = z.array(JoinConditionSchema).min(1);

export const ReportColumnConfigSchema = z.array(z.string().min(1)).min(1).nullable();
export type ReportColumnConfig = z.infer<typeof ReportColumnConfigSchema>;
