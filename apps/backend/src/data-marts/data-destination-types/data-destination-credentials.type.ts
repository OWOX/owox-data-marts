import { z } from 'zod';
import { EmailCredentialsSchema } from './ee/email/schemas/email-credentials.schema';
import { GoogleSheetsCredentialsSchema } from './google-sheets/schemas/google-sheets-credentials.schema';
import { LookerStudioConnectorCredentialsSchema } from './looker-studio-connector/schemas/looker-studio-connector-credentials.schema';

export const DataDestinationCredentialsSchema = z.discriminatedUnion('type', [
  EmailCredentialsSchema,
  GoogleSheetsCredentialsSchema,
  LookerStudioConnectorCredentialsSchema,
]);

export type DataDestinationCredentials = z.infer<typeof DataDestinationCredentialsSchema>;
