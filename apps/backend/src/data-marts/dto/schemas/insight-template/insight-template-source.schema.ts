import { z } from 'zod';

export const MAX_TEMPLATE_SOURCES = 5;

export enum InsightTemplateSourceType {
  CURRENT_DATA_MART = 'CURRENT_DATA_MART',
  INSIGHT_ARTIFACT = 'INSIGHT_ARTIFACT',
}

export const InsightTemplateSourceSchema = z.object({
  key: z.string().trim().min(1).max(64),
  type: z.nativeEnum(InsightTemplateSourceType),
  artifactId: z.string().uuid().optional().nullable(),
});

export const InsightTemplateSourcesSchema = z
  .array(InsightTemplateSourceSchema)
  .max(MAX_TEMPLATE_SOURCES)
  .default([]);

export type InsightTemplateSource = z.infer<typeof InsightTemplateSourceSchema>;
export type InsightTemplateSources = z.infer<typeof InsightTemplateSourcesSchema>;
