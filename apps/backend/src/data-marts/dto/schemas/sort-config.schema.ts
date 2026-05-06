import { z } from 'zod';

export const SortRuleSchema = z.object({
  column: z.string().min(1),
  direction: z.enum(['asc', 'desc']),
});

export const SortConfigSchema = z.array(SortRuleSchema).nullable();

export type SortRule = z.infer<typeof SortRuleSchema>;
export type SortConfig = z.infer<typeof SortConfigSchema>;
