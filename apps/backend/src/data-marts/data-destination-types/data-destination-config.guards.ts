import { DataDestinationConfig, DataDestinationConfigSchema } from './data-destination-config.type';
import {
  GoogleSheetsConfig,
  GoogleSheetsConfigType,
} from './google-sheets/schemas/google-sheets-config.schema';

export function isValidDataDestinationConfig(
  destination: unknown
): destination is DataDestinationConfig {
  return DataDestinationConfigSchema.safeParse(destination).success;
}

export function isGoogleSheetsDestination(
  definition: DataDestinationConfig
): definition is GoogleSheetsConfig {
  return definition.type === GoogleSheetsConfigType;
}
