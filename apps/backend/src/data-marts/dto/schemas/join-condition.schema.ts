import { z } from 'zod';

export const JoinConditionSchema = z.object({
  sourceFieldName: z.string().min(1),
  targetFieldName: z.string().min(1),
});
export type JoinCondition = z.infer<typeof JoinConditionSchema>;
export const JoinConditionsSchema = z.array(JoinConditionSchema);
