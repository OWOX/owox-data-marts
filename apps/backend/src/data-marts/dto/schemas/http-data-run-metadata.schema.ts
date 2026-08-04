import { z } from 'zod';
import { FilterConfigSchema } from './filter-config.schema';
import { SortConfigSchema } from './sort-config.schema';
import { AggregationConfigSchema } from './aggregation-config.schema';
import { DateTruncConfigSchema } from './date-trunc-config.schema';
import { SourceDataLastUpdatedSchema } from './source-data-last-updated.schema';

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
  aggregation: AggregationConfigSchema.optional(),
  dateTrunc: DateTruncConfigSchema.optional(),
  limit: z.number().int().positive().optional(),
  dataDescription: z.object({ dataHeaders: z.array(DataHeaderSchema) }).optional(),
  rowCount: z.number().int().nonnegative().optional(),
  bytesWritten: z.number().int().nonnegative().optional(),
  completed: z.boolean().optional(),
  // Grand-total row keyed by output-column name: one scalar per selected metric aggregated over the
  // full result (every selected numeric field, plus non-numeric fields eligible for Count/Count Unique).
  // Computed as a SEPARATE best-effort query at run time whenever the result has an eligible metric —
  // NOT limited to explicitly aggregated reports. Omitted when nothing is eligible, or when the
  // totals query failed — in which case `totalsError` says so.
  totals: z.record(z.union([z.number(), z.string(), z.boolean(), z.null()])).optional(),
  // Why totals are absent, when the cause was a FAILURE rather than "nothing eligible". Totals are
  // best-effort so their failure never costs the run its rows, but an unexplained absence is
  // indistinguishable from a report that has no totals — and this is the only record of the run
  // anyone can inspect afterwards.
  totalsError: z.string().optional(),
  // Fully-composed executed SQL (output controls inlined as literals). Present only for the
  // report-level HTTP Data endpoint, and only when output controls / blending produced an override.
  executionSqlQuery: z.string().optional(),
  /**
   * Snapshot of when the source tables had last changed at the moment this run executed.
   * Optional so runs recorded before this field existed still parse.
   */
  dataLastUpdated: SourceDataLastUpdatedSchema.optional(),
});

export type HttpDataRunMetadata = z.infer<typeof HttpDataRunMetadataSchema>;
