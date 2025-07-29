import { DataDestinationCredentials } from './data-destination-credentials.type';
import { DataDestinationType } from './enums/data-destination-type.enum';
import { DataDestinationCredentialsSafe } from '../dto/presentation/data-destination-response-api.dto';

export function getPublicCredentials(
  type: DataDestinationType,
  credentials: DataDestinationCredentials | undefined
): DataDestinationCredentialsSafe | undefined {
  if (!credentials) return undefined;

  switch (type) {
    case DataDestinationType.GOOGLE_SHEETS:
      return {
        type: 'google-sheets-credentials',
        serviceAccountKey: {
          type: 'service_account',
          project_id: credentials.serviceAccountKey.project_id,
          client_email: credentials.serviceAccountKey.client_email,
          client_id: credentials.serviceAccountKey.client_id,
        },
      };
    default:
      return undefined;
  }
}
