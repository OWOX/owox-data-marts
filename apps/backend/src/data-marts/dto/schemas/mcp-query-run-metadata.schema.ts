import { z } from 'zod';
import { SourceDataLastUpdatedSchema } from './source-data-last-updated.schema';

export const McpQueryRunMetadataSchema = z.object({
  columns: z.array(z.string()),
  rowCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  executionSqlQuery: z.string().optional(),
  filterCount: z.number().int().nonnegative().optional(),
  aggregationCount: z.number().int().nonnegative().optional(),
  query: z
    .object({
      fields: z.array(z.string()),
      filters: z.array(z.unknown()).optional(),
      sort: z.array(z.unknown()).optional(),
      aggregations: z.array(z.unknown()).optional(),
      dateBuckets: z.array(z.unknown()).optional(),
      // The alias paths whose Unique Count the run asked for. Journaled separately because the
      // tool splits the pseudo-field out of `fields` — without this the parse drops it and Run
      // History shows a run whose extra column came from nowhere.
      uniqueCountConfig: z.array(z.string()).optional(),
      limit: z.number().int().positive(),
    })
    .optional(),
  /**
   * Snapshot of when the source tables had last changed at the moment this run executed.
   * Optional so runs recorded before this field existed still parse.
   */
  dataLastUpdated: SourceDataLastUpdatedSchema.optional(),
  totalsError: z.string().optional(),
});

export type McpQueryRunMetadata = z.infer<typeof McpQueryRunMetadataSchema>;
