import { z } from 'zod';

export const InsightRunDefinitionSchema = z.object({
  insight: z.object({
    title: z.string(),
    template: z.string().optional().nullable(),
  }),
});

export type InsightRunDefinition = z.infer<typeof InsightRunDefinitionSchema>;
