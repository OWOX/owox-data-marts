import { z } from 'zod';

export const BigQueryConfigSchema = z.object({
  projectId: z.string().min(1, 'projectId is required'),
  location: z.string().min(1, 'location is required'),
});

export type BigQueryConfig = z.infer<typeof BigQueryConfigSchema>;
