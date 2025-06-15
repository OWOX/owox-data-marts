import { z } from 'zod';

export const BigQueryCredentialsSchema = z
  .object({
    private_key: z.string().min(1, 'private_key is required'),
    client_email: z.string().min(1, 'client_email is required'),
  })
  .passthrough();

export type BigQueryCredentialsDto = z.infer<typeof BigQueryCredentialsSchema>;
