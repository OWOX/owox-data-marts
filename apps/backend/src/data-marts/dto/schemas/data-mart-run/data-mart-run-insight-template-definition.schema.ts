import { z } from 'zod';
import { InsightTemplateSourcesSchema } from '../insight-template/insight-template-source.schema';

export const DataMartRunInsightTemplateDefinitionSchema = z.object({
  title: z.string().trim().optional(),
  template: z.string().trim().optional().nullable(),
  sources: InsightTemplateSourcesSchema.nullable().optional(),
});

export type DataMartRunInsightTemplateDefinition = z.infer<
  typeof DataMartRunInsightTemplateDefinitionSchema
>;
