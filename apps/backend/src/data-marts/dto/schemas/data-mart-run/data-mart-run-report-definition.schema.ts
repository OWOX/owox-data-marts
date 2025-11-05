import { z } from 'zod';
import { DataDestinationConfigSchema } from '../../../data-destination-types/data-destination-config.type';
import { DataDestinationType } from '../../../data-destination-types/enums/data-destination-type.enum';

export const DataMartRunReportDefinitionSchema = z.object({
  title: z.string().trim().optional(),
  destination: z.object({
    id: z.string().uuid(),
    title: z.string(),
    type: z.nativeEnum(DataDestinationType),
  }),
  destinationConfig: DataDestinationConfigSchema,
});

export type DataMartRunReportDefinition = z.infer<typeof DataMartRunReportDefinitionSchema>;
