import { z } from 'zod';
import { DataDestinationConfigSchema } from '../../../data-destination-types/data-destination-config.type';
import { DataDestinationType } from '../../../data-destination-types/enums/data-destination-type.enum';
import { FilterConfigSchema } from '../filter-config.schema';
import { SortConfigSchema } from '../sort-config.schema';

export const DataMartRunReportOutputConfigSchema = z.object({
  filterConfig: FilterConfigSchema.optional(),
  sortConfig: SortConfigSchema.optional(),
  limitConfig: z.number().int().nonnegative().nullable().optional(),
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
});

export type DataMartRunReportDefinition = z.infer<typeof DataMartRunReportDefinitionSchema>;
