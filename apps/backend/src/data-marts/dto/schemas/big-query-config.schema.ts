import { z } from 'zod';

export const BigQueryConfigSchema = z.object({
  projectId: z.string().min(1, 'projectId is required'),
  datasetId: z.string().min(1, 'datasetId is required'),
  location: z.string().min(1, 'location is required'),
});

export type BigQueryConfigDto = z.infer<typeof BigQueryConfigSchema>;
