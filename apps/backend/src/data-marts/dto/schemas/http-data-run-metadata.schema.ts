import { z } from 'zod';
import { FilterConfigSchema } from './filter-config.schema';
import { SortConfigSchema } from './sort-config.schema';

export const HTTP_DATA_FORMAT = 'ndjson' as const;

const DataHeaderSchema = z.object({
  name: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  type: z.string().optional(),
});

export const HttpDataRunMetadataSchema = z.object({
  format: z.literal(HTTP_DATA_FORMAT),
  columns: z.array(z.string()),
  filter: FilterConfigSchema.optional(),
  sort: SortConfigSchema.optional(),
  limit: z.number().int().positive().optional(),
  dataDescription: z.object({ dataHeaders: z.array(DataHeaderSchema) }).optional(),
  rowCount: z.number().int().nonnegative().optional(),
  bytesWritten: z.number().int().nonnegative().optional(),
  completed: z.boolean().optional(),
});

export type HttpDataRunMetadata = z.infer<typeof HttpDataRunMetadataSchema>;
