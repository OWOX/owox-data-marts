import { z } from 'zod';

// Keep these directions in sync with the public traversal rule literals in
// `packages/api-client/src/data-marts.ts`.
export const SortRuleSchema = z.object({
  column: z.string().min(1),
  direction: z.enum(['asc', 'desc']),
});

export const SortConfigSchema = z.array(SortRuleSchema).nullable();

export type SortRule = z.infer<typeof SortRuleSchema>;
export type SortConfig = z.infer<typeof SortConfigSchema>;
