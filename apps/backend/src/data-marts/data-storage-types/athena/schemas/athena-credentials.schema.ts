import { z } from 'zod';

export const AthenaCredentialsSchema = z
  .object({
    accessKeyId: z.string().min(1, 'accessKeyId is required'),
    secretAccessKey: z.string().min(1, 'secretAccessKey is required'),
    sessionToken: z.string().optional(),
  })
  .passthrough();

export type AthenaCredentials = z.infer<typeof AthenaCredentialsSchema>;
