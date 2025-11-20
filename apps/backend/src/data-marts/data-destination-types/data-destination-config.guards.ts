import { DataDestinationConfig, DataDestinationConfigSchema } from './data-destination-config.type';
import { EmailConfig, EmailConfigType } from './ee/email/schemas/email-config.schema';
import {
  GoogleSheetsConfig,
  GoogleSheetsConfigType,
} from './google-sheets/schemas/google-sheets-config.schema';
import {
  LookerStudioConnectorConfig,
  LookerStudioConnectorConfigType,
} from './looker-studio-connector/schemas/looker-studio-connector-config.schema';

export function isValidDataDestinationConfig(
  destination: unknown
): destination is DataDestinationConfig {
  return DataDestinationConfigSchema.safeParse(destination).success;
}

export function isEmailConfig(definition: DataDestinationConfig): definition is EmailConfig {
  return definition.type === EmailConfigType;
}

export function isGoogleSheetsConfig(
  definition: DataDestinationConfig
): definition is GoogleSheetsConfig {
  return definition.type === GoogleSheetsConfigType;
}

export function isLookerStudioConnectorConfig(
  definition: DataDestinationConfig
): definition is LookerStudioConnectorConfig {
  return definition.type === LookerStudioConnectorConfigType;
}
