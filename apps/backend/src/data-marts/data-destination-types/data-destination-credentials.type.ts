import { z } from 'zod';
import { GoogleSheetsCredentialsSchema } from './google-sheets/schemas/google-sheets-credentials.schema';

export const DataDestinationCredentialsSchema = z.discriminatedUnion('type', [
  GoogleSheetsCredentialsSchema,
]);

export type DataDestinationCredentials = z.infer<typeof DataDestinationCredentialsSchema>;
