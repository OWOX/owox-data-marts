import { z } from 'zod';
import { GoogleSheetsCredentialsSchema } from './google-sheets/schemas/google-sheets-credentials.schema';
import { LookerStudioConnectorCredentialsSchema } from './looker-studio-connector/schemas/looker-studio-connector-credentials.schema';

export const DataDestinationCredentialsSchema = z.discriminatedUnion('type', [
  GoogleSheetsCredentialsSchema,
  LookerStudioConnectorCredentialsSchema,
]);

export type DataDestinationCredentials = z.infer<typeof DataDestinationCredentialsSchema>;
