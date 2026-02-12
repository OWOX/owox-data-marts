import { z } from 'zod';

export const BIGQUERY_AUTODETECT_LOCATION = 'AUTODETECT';

export const BigQueryConfigSchema = z.object({
  projectId: z.string().min(1, 'projectId is required'),
  location: z.string().default(BIGQUERY_AUTODETECT_LOCATION),
});

export type BigQueryConfig = z.infer<typeof BigQueryConfigSchema>;
