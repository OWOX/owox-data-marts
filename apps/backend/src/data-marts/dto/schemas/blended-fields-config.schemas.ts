import { z } from 'zod';
import { AGGREGATE_FUNCTIONS } from './relationship-schemas';

export const BlendedFieldOverrideSchema = z.object({
  alias: z.string().optional(),
  isHidden: z.boolean().optional(),
  aggregateFunction: z.enum(AGGREGATE_FUNCTIONS).optional(),
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
  sources: z.array(BlendedSourceSchema),
});
export type BlendedFieldsConfig = z.infer<typeof BlendedFieldsConfigSchema>;
