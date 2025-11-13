import {
  DataDestinationCredentials,
  DataDestinationCredentialsSchema,
} from './data-destination-credentials.type';
import {
  EmailCredentials,
  EmailCredentialsType,
} from './ee/email/schemas/email-credentials.schema';
import {
  GoogleSheetsCredentials,
  GoogleSheetsCredentialsType,
} from './google-sheets/schemas/google-sheets-credentials.schema';

export function isValidDataDestinationCredentials(
  credentials: unknown
): credentials is DataDestinationCredentials {
  return DataDestinationCredentialsSchema.safeParse(credentials).success;
}

export function isEmailCredentials(
  credentials: DataDestinationCredentials
): credentials is EmailCredentials {
  return credentials.type === EmailCredentialsType;
}

export function isGoogleSheetsCredentials(
  credentials: DataDestinationCredentials
): credentials is GoogleSheetsCredentials {
  return credentials.type === GoogleSheetsCredentialsType;
}
