import { EmailConfigSchema, LegacyEmailConfigSchema } from './ee/email/schemas/email-config.schema';
import { GoogleSheetsConfigSchema } from './google-sheets/schemas/google-sheets-config.schema';
import { z } from 'zod';
import { LookerStudioConnectorConfigSchema } from './looker-studio-connector/schemas/looker-studio-connector-config.schema';

const EmailConfigWithMigrationSchema = EmailConfigSchema.or(
  LegacyEmailConfigSchema.transform(legacy => ({
    type: legacy.type,
    subject: legacy.subject,
    reportCondition: legacy.reportCondition,
    templateSource: {
      type: 'CUSTOM_MESSAGE' as const,
      config: {
        messageTemplate: legacy.messageTemplate,
      },
    },
  }))
);

export const DataDestinationConfigSchema = z.union([
  EmailConfigWithMigrationSchema,
  GoogleSheetsConfigSchema,
  LookerStudioConnectorConfigSchema,
]);

export type DataDestinationConfig = z.infer<typeof DataDestinationConfigSchema>;
