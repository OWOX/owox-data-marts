import { z } from 'zod';

export const RedshiftCredentialsSchema = z
  .object({
    accessKeyId: z.string().min(1, 'accessKeyId is required'),
    secretAccessKey: z.string().min(1, 'secretAccessKey is required'),
  })
  .passthrough();

export type RedshiftCredentials = z.infer<typeof RedshiftCredentialsSchema>;
