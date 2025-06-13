import { z } from 'zod';

export const AthenaConfigSchema = z.object({
  region: z.string().min(1, 'region is required'),
  databaseName: z.string().min(1, 'databaseName is required'),
  outputBucket: z.string().min(1, 'outputBucket is required'),
});

export type AthenaConfig = z.infer<typeof AthenaConfigSchema>;
