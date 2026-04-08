import { z } from 'zod';

export const BlendingBehaviourEnum = z.enum(['AUTO_BLEND_ALL', 'BLEND_DIRECT_ONLY', 'MANUAL']);
export type BlendingBehaviour = z.infer<typeof BlendingBehaviourEnum>;

export const BlendedFieldOverrideSchema = z.object({
  alias: z.string().optional(),
  isHidden: z.boolean().optional(),
  aggregateFunction: z
    .enum(['STRING_AGG', 'MAX', 'MIN', 'SUM', 'COUNT', 'ANY_VALUE'])
    .optional(),
});
export type BlendedFieldOverride = z.infer<typeof BlendedFieldOverrideSchema>;

export const BlendedSourceSchema = z.object({
  path: z.string().min(1),
  alias: z.string().min(1),
  isExcluded: z.boolean().optional(),
  fields: z.record(z.string(), BlendedFieldOverrideSchema).optional(),
});
export type BlendedSource = z.infer<typeof BlendedSourceSchema>;

export const BlendedFieldsConfigSchema = z.object({
  blendingBehaviour: BlendingBehaviourEnum,
  sources: z.array(BlendedSourceSchema),
});
export type BlendedFieldsConfig = z.infer<typeof BlendedFieldsConfigSchema>;
