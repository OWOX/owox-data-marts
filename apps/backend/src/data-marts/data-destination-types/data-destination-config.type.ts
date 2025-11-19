import { EmailConfigSchema } from './ee/email/schemas/email-config.schema';
import { GoogleSheetsConfigSchema } from './google-sheets/schemas/google-sheets-config.schema';
import { z } from 'zod';
import { LookerStudioConnectorConfigSchema } from './looker-studio-connector/schemas/looker-studio-connector-config.schema';

export const DataDestinationConfigSchema = z.discriminatedUnion('type', [
  EmailConfigSchema,
  GoogleSheetsConfigSchema,
  LookerStudioConnectorConfigSchema,
]);

export type DataDestinationConfig = z.infer<typeof DataDestinationConfigSchema>;
