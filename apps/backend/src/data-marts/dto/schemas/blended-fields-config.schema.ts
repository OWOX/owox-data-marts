import { z } from 'zod';
import { AGGREGATE_FUNCTIONS } from './aggregate-function.schema';

// Segments flow into SQL identifiers (CTE names, column prefixes) and must stay safe
// even when the UI is bypassed. Note: `BlendedSource.alias` is a display label, not an
// identifier, so it is intentionally NOT validated against these regexes.
export const ALIAS_SEGMENT_REGEX = /^[a-z0-9_]+$/;
export const ALIAS_PATH_REGEX = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/;
export const ALIAS_SEGMENT_ERROR = 'must contain only lowercase letters, numbers, and underscores';

export const BlendedFieldOverrideSchema = z.object({
  alias: z.string().min(1).max(255).optional(),
  isHidden: z.boolean().optional(),
  aggregateFunction: z.enum(AGGREGATE_FUNCTIONS).optional(),
});
export type BlendedFieldOverride = z.infer<typeof BlendedFieldOverrideSchema>;

export const BlendedSourceSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(255)
    .regex(
      ALIAS_PATH_REGEX,
      'path must be a dot-separated chain of alias segments (e.g. "orders" or "orders.items")'
    ),
  alias: z.string().min(1).max(255),
  isExcluded: z.boolean().optional(),
  fields: z.record(z.string(), BlendedFieldOverrideSchema).optional(),
});
export type BlendedSource = z.infer<typeof BlendedSourceSchema>;

export const BlendedFieldsConfigSchema = z.object({
  sources: z.array(BlendedSourceSchema),
});
export type BlendedFieldsConfig = z.infer<typeof BlendedFieldsConfigSchema>;
