// Imported by migration 1792700000000: keep it and its imports when the legacy code goes.
import { secretValue } from '../credentials/credential.types';
import type { CredentialPublicMetadata, CredentialSecret } from '../credentials/credential.types';
import {
  GOOGLE_CHAT_WEBHOOK_DEFINITION_ID,
  GOOGLE_SHEETS_OAUTH_DEFINITION_ID,
} from '../credentials/services/builtin-credential-definitions';
import type { DataDestinationCredentials } from './data-destination-credentials.type';
import type { GoogleSheetsCredentials } from './google-sheets/schemas/google-sheets-credentials.schema';
import { DataDestinationType } from './enums/data-destination-type.enum';

export const GOOGLE_SERVICE_ACCOUNT_DEFINITION_ID = 'google-service-account';

export const DESTINATION_CREDENTIAL_DEFINITION_IDS: Readonly<
  Partial<Record<DataDestinationType, readonly string[]>>
> = {
  [DataDestinationType.GOOGLE_SHEETS]: [
    GOOGLE_SERVICE_ACCOUNT_DEFINITION_ID,
    GOOGLE_SHEETS_OAUTH_DEFINITION_ID,
  ],
  [DataDestinationType.GOOGLE_CHAT]: [GOOGLE_CHAT_WEBHOOK_DEFINITION_ID],
};

/** The Destination types that accept the definition. */
export function destinationTypesForDefinition(definitionId: string): DataDestinationType[] {
  return Object.values(DataDestinationType).filter(type =>
    DESTINATION_CREDENTIAL_DEFINITION_IDS[type]?.includes(definitionId)
  );
}

export function toDestinationAdapterCredentials(
  definitionId: string,
  secret: CredentialSecret,
  metadata: CredentialPublicMetadata | null
): DataDestinationCredentials {
  if (definitionId === GOOGLE_SERVICE_ACCOUNT_DEFINITION_ID) {
    return {
      type: 'google-sheets-credentials',
      serviceAccountKey: JSON.parse(
        secretValue(secret)
      ) as GoogleSheetsCredentials['serviceAccountKey'],
    };
  }
  if (definitionId === GOOGLE_CHAT_WEBHOOK_DEFINITION_ID) {
    const values = {
      ...(metadata && 'fields' in metadata ? metadata.fields : {}),
      ...('fields' in secret ? secret.fields : {}),
    };
    return { type: 'google-chat-credentials', webhookUrl: values.webhookUrl };
  }
  throw new Error(`Credential definition "${definitionId}" has no Destination adapter shape`);
}
