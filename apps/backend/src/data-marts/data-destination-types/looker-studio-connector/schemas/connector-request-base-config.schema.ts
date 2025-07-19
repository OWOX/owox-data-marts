import { z } from 'zod';

export const ConnectorRequestBaseConfigSchema = z.object({
  deploymentUrl: z.string().url(),
  isCachingEnabled: z
    .string()
    .refine(val => val === 'true' || val === 'false', {
      message: "isCachingEnabled must be 'true' or 'false'",
    })
    .transform(val => val === 'true')
    .optional(),
  cacheTtlSeconds: z
    .string()
    .refine(val => !isNaN(Number(val)) && Number(val) >= 0, {
      message: 'cacheTtlSeconds must be a valid non-negative number string',
    })
    .transform(val => Number(val))
    .optional(),
});

export type ConnectorRequestBaseConfig = z.infer<typeof ConnectorRequestBaseConfigSchema>;
