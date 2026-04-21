import { z } from 'zod';

export const BIGQUERY_AUTODETECT_LOCATION = 'AUTODETECT';

export const BigQueryConfigSchema = z.object({
  projectId: z
    .string()
    .min(1, 'projectId is required')
    .regex(
      /^(?:[a-z][a-z0-9.-]*:)?[a-z][a-z0-9-]{4,28}[a-z0-9]$/,
      'Invalid GCP project ID: 6-30 lowercase letters, numbers, or hyphens; must start with a letter and not end with a hyphen (optionally prefixed by a domain and colon, e.g. example.com:my-project)'
    ),
  location: z
    .string()
    .nullish()
    .transform(value => value ?? BIGQUERY_AUTODETECT_LOCATION),
});

export type BigQueryConfig = z.infer<typeof BigQueryConfigSchema>;
