import { z } from 'zod';

export const TemplateEditPlaceholderTagSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[A-Za-z0-9_-]+$/, 'Tag id must contain only letters, numbers, underscore, or dash')
      .describe('Placeholder tag id used in text as [[TAG:<id>]].'),
    name: z.string().min(1).describe('Template tag name, e.g. "table" or "value".'),
    params: z
      .record(z.unknown())
      .describe(
        'Raw tag parameters object. Runtime validation and tag-specific schemas are handled later.'
      ),
  })
  .strict();

export type TemplateEditPlaceholderTag = z.infer<typeof TemplateEditPlaceholderTagSchema>;
