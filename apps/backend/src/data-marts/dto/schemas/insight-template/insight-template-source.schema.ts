import { z } from 'zod';

export const MAX_TEMPLATE_SOURCES = 10;

export enum InsightTemplateSourceType {
  CURRENT_DATA_MART = 'CURRENT_DATA_MART',
  INSIGHT_ARTIFACT = 'INSIGHT_ARTIFACT',
}

export const InsightTemplateSourceSchema = z.object({
  templateSourceId: z.string().uuid(),
  key: z.string().trim().min(1).max(64),
  type: z.nativeEnum(InsightTemplateSourceType),
  artifactId: z.string().uuid(),
});

export const InsightTemplateSourceCommandSchema = InsightTemplateSourceSchema.extend({
  templateSourceId: z.string().uuid().optional(),
});

export const InsightTemplateSourcesSchema = z
  .array(InsightTemplateSourceSchema)
  .max(MAX_TEMPLATE_SOURCES)
  .default([]);

export const InsightTemplateSourcesCommandSchema = z
  .array(InsightTemplateSourceCommandSchema)
  .max(MAX_TEMPLATE_SOURCES)
  .default([]);

export type InsightTemplateSource = z.infer<typeof InsightTemplateSourceSchema>;
export type InsightTemplateSources = z.infer<typeof InsightTemplateSourcesSchema>;
export type InsightTemplateSourceCommand = z.infer<typeof InsightTemplateSourceCommandSchema>;
export type InsightTemplateSourcesCommand = z.infer<typeof InsightTemplateSourcesCommandSchema>;
