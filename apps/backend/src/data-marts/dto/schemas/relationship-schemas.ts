import { z } from 'zod';

export const JoinConditionSchema = z.object({
  sourceFieldName: z.string().min(1),
  targetFieldName: z.string().min(1),
});
export type JoinCondition = z.infer<typeof JoinConditionSchema>;
export const JoinConditionsSchema = z.array(JoinConditionSchema).min(1);

export const BlendedFieldConfigSchema = z.object({
  targetFieldName: z.string().min(1),
  outputAlias: z.string().min(1),
  isHidden: z.boolean().default(false),
  aggregateFunction: z
    .enum(['STRING_AGG', 'MAX', 'MIN', 'SUM', 'COUNT', 'ANY_VALUE'])
    .default('STRING_AGG'),
});
export type BlendedFieldConfig = z.infer<typeof BlendedFieldConfigSchema>;
export const BlendedFieldsSchema = z.array(BlendedFieldConfigSchema).min(1);

export const ReportColumnConfigSchema = z.array(z.string().min(1)).min(1).nullable();
export type ReportColumnConfig = z.infer<typeof ReportColumnConfigSchema>;
