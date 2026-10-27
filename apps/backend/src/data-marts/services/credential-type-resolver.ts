import { DestinationCredentialType } from '../enums/destination-credential-type.enum';
import type { CredentialIdentity } from '../entities/credential-identity.type';
import type { StoredDestinationCredentials } from '../entities/stored-destination-credentials.type';

export function resolveDestinationCredentialType(
  credentials: StoredDestinationCredentials
): DestinationCredentialType {
  const credType = 'type' in credentials ? (credentials.type as string | undefined) : undefined;
  switch (credType) {
    case 'google-sheets-credentials':
      return DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT;
    case 'looker-studio-credentials':
      return DestinationCredentialType.LOOKER_STUDIO;
    case 'email-credentials':
      return DestinationCredentialType.EMAIL;
    case 'google-chat-credentials':
      return DestinationCredentialType.GOOGLE_CHAT_WEBHOOK;
    default:
      throw new Error(`Unknown destination credential type: ${String(credType)}`);
  }
}

export function extractDestinationIdentity(
  type: DestinationCredentialType,
  credentials: StoredDestinationCredentials
): CredentialIdentity | null {
  if (
    type === DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT &&
    'serviceAccountKey' in credentials
  ) {
    const saKey = credentials.serviceAccountKey as Record<string, unknown> | undefined;
    return saKey?.client_email ? { clientEmail: saKey.client_email as string } : null;
  }
  return null;
}
