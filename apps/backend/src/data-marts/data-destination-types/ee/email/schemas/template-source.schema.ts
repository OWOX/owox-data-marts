import { z } from 'zod';
import { TemplateSourceTypeEnum } from '../../../../enums/template-source-type.enum';

export type TemplateSourceType = TemplateSourceTypeEnum;

/**
 * Configuration for CUSTOM_MESSAGE template source
 */
export const CustomMessageTemplateConfigSchema = z.object({
  messageTemplate: z.string().nonempty('Message template is required'),
});

export type CustomMessageTemplateConfig = z.infer<typeof CustomMessageTemplateConfigSchema>;

/**
 * Configuration for INSIGHT_TEMPLATE template source
 */
export const InsightTemplateConfigSchema = z.object({
  insightTemplateId: z.string().nonempty('Insight template ID is required'),
});

export type InsightTemplateConfig = z.infer<typeof InsightTemplateConfigSchema>;

/**
 * Template source configuration - discriminated union based on type
 */
export const TemplateSourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal(TemplateSourceTypeEnum.CUSTOM_MESSAGE),
    config: CustomMessageTemplateConfigSchema,
  }),
  z.object({
    type: z.literal(TemplateSourceTypeEnum.INSIGHT_TEMPLATE),
    config: InsightTemplateConfigSchema,
  }),
]);

export type TemplateSource = z.infer<typeof TemplateSourceSchema>;
