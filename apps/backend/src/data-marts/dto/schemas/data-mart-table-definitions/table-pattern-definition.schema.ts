import { z } from 'zod';

export const TablePatternDefinitionSchema = z.object({
  pattern: z.string().min(2, 'pattern is required'),
});

export type TablePatternDefinition = z.infer<typeof TablePatternDefinitionSchema>;
