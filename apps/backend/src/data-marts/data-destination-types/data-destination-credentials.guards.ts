import {
  DataDestinationCredentials,
  DataDestinationCredentialsSchema,
} from './data-destination-credentials.type';
import {
  GoogleSheetsCredentials,
  GoogleSheetsCredentialsType,
} from './google-sheets/schemas/google-sheets-credentials.schema';

export function isValidDataDestinationCredentials(
  credentials: unknown
): credentials is DataDestinationCredentials {
  return DataDestinationCredentialsSchema.safeParse(credentials).success;
}

export function isGoogleSheetsCredentials(
  credentials: DataDestinationCredentials
): credentials is GoogleSheetsCredentials {
  return credentials.type === GoogleSheetsCredentialsType;
}
