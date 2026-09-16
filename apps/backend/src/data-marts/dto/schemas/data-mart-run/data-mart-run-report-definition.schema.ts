import { z } from 'zod';
import { DataDestinationConfigSchema } from '../../../data-destination-types/data-destination-config.type';
import { DataDestinationType } from '../../../data-destination-types/enums/data-destination-type.enum';
import { AggregationConfigSchema } from '../aggregation-config.schema';
import { FilterConfigSchema } from '../filter-config.schema';
import { SortConfigSchema } from '../sort-config.schema';
import { SourceDataLastUpdatedSchema } from '../source-data-last-updated.schema';

export const DataMartRunReportOutputConfigSchema = z.object({
  filterConfig: FilterConfigSchema.optional(),
  sortConfig: SortConfigSchema.optional(),
  limitConfig: z.number().int().nonnegative().nullable().optional(),
  /**
   * The aggregations the product chose because the analyst chose none — a snapshot of what was in
   * force, for the same reason `sortConfig` is rewritten here when a stale sort is dropped.
   * Optional so earlier runs still parse.
   */
  autoAppliedAggregations: AggregationConfigSchema.optional(),
  /**
   * The row-level calculated fields lifted to group level — `{{clicks}}/{{impressions}}` rewritten
   * as `SUM(clicks)/SUM(impressions)`. Its own field because a lift-only collapse leaves
   * `autoAppliedAggregations` empty and a lifted formula has no single `function` to report.
   * Column names only; the rewritten text is an execution detail. Optional so earlier runs parse.
   */
  autoAppliedLiftedColumns: z.array(z.string()).optional(),
});

export const DataMartRunReportDefinitionSchema = z.object({
  title: z.string().trim().optional(),
  destination: z.object({
    id: z.string().uuid(),
    title: z.string(),
    type: z.nativeEnum(DataDestinationType),
  }),
  destinationConfig: DataDestinationConfigSchema,
  outputConfig: DataMartRunReportOutputConfigSchema.nullable().optional(),
  executionSqlQuery: z.string().optional(),
  /**
   * Snapshot of when the source tables had last changed at the moment this run executed.
   * Optional so runs recorded before this field existed still parse.
   */
  dataLastUpdated: SourceDataLastUpdatedSchema.optional(),
});

export type DataMartRunReportDefinition = z.infer<typeof DataMartRunReportDefinitionSchema>;
