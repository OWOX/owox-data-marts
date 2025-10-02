import { GoogleSheetsConfigSchema } from './google-sheets/schemas/google-sheets-config.schema';
import { z } from 'zod';
import { LookerStudioConnectorConfigSchema } from './looker-studio-connector/schemas/looker-studio-connector-config.schema';

export const DataDestinationConfigSchema = z.discriminatedUnion('type', [
  GoogleSheetsConfigSchema,
  LookerStudioConnectorConfigSchema,
]);

export type DataDestinationConfig = z.infer<typeof DataDestinationConfigSchema>;
