import { z } from 'zod';
import { FilterConfigSchema } from './filter-config.schema';

/**
 * What a Data Setup preview journals into Run History: the request it ran and a summary of the
 * answer. Never the rows themselves — Run History is visible to everyone who can see the Data
 * Mart, and the preview's rows are only ever returned to the person who asked for them.
 */
export const DataMartPreviewRunMetadataSchema = z.object({
  columns: z.array(z.string()),
  rowCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  executionSqlQuery: z.string().optional(),
  filterCount: z.number().int().nonnegative(),
  query: z.object({
    filters: FilterConfigSchema.optional(),
    limit: z.number().int().positive(),
  }),
});

export type DataMartPreviewRunMetadata = z.infer<typeof DataMartPreviewRunMetadataSchema>;
