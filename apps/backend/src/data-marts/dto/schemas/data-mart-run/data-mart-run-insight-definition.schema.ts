import { z } from 'zod';

export const DataMartRunInsightDefinitionSchema = z.object({
  title: z.string().trim().optional(),
  template: z.string().trim().optional().nullable(),
});

export type DataMartRunInsightDefinition = z.infer<typeof DataMartRunInsightDefinitionSchema>;
