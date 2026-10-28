// Imported by migration 1792700000000: keep it and its imports when the legacy code goes.
import type { CredentialPublicMetadata } from '../credentials/credential.types';
import {
  GOOGLE_CHAT_WEBHOOK_DEFINITION_ID,
  GOOGLE_SHEETS_OAUTH_DEFINITION_ID,
} from '../credentials/services/builtin-credential-definitions';
import type { CredentialIdentity } from '../entities/credential-identity.type';
import type { DataDestinationCredential } from '../entities/data-destination-credential.entity';
import { DestinationCredentialType } from '../enums/destination-credential-type.enum';
import { GOOGLE_SERVICE_ACCOUNT_DEFINITION_ID } from './destination-credential-definitions';

export type GoogleSheetsServiceAccountCredentialsPublic = {
  type: 'google-sheets-credentials';
  serviceAccountKey: {
    type: 'service_account';
    project_id: string;
    client_email: string;
    client_id?: string;
  };
};

export type GoogleSheetsOAuthCredentialsPublic = {
  type: 'google-sheets-oauth-credentials';
  identity: CredentialIdentity | null;
};

export type GoogleChatCredentialsPublic = {
  type: 'google-chat-credentials';
  configured: true;
};

/** What a Google Sheets or Google Chat webhook Destination shows of its key; never the key. */
export type DestinationPublicCredentials =
  | GoogleSheetsServiceAccountCredentialsPublic
  | GoogleSheetsOAuthCredentialsPublic
  | GoogleChatCredentialsPublic;

const CHAT_CONFIGURED: GoogleChatCredentialsPublic = {
  type: 'google-chat-credentials',
  configured: true,
};

/** From a bound Credential's public metadata; undefined for a shape that shows nothing. */
export function publicCredentialsOfBound(
  definitionId: string,
  metadata: CredentialPublicMetadata | null
): DestinationPublicCredentials | undefined {
  if (definitionId === GOOGLE_CHAT_WEBHOOK_DEFINITION_ID) return CHAT_CONFIGURED;
  if (!metadata) return undefined;
  if (definitionId === GOOGLE_SERVICE_ACCOUNT_DEFINITION_ID && 'clientEmail' in metadata) {
    return {
      type: 'google-sheets-credentials',
      serviceAccountKey: {
        type: 'service_account',
        project_id: metadata.projectId,
        client_email: metadata.clientEmail,
        ...(metadata.clientId && { client_id: metadata.clientId }),
      },
    };
  }
  if (definitionId === GOOGLE_SHEETS_OAUTH_DEFINITION_ID && 'account' in metadata) {
    const { email, name, picture } = metadata.account;
    return {
      type: 'google-sheets-oauth-credentials',
      identity: { email, ...(name && { name }), ...(picture && { picture }) },
    };
  }
  return undefined;
}

/** From an old row, as before Destinations took Credentials; undefined for a row that shows nothing. */
export function publicCredentialsOfRow(
  row: Pick<DataDestinationCredential, 'type' | 'credentials' | 'identity'>
): DestinationPublicCredentials | undefined {
  switch (row.type) {
    case DestinationCredentialType.GOOGLE_CHAT_WEBHOOK:
      return CHAT_CONFIGURED;
    case DestinationCredentialType.GOOGLE_OAUTH:
      return { type: 'google-sheets-oauth-credentials', identity: row.identity ?? null };
    case DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT: {
      const key = (row.credentials as { serviceAccountKey?: Record<string, string> } | undefined)
        ?.serviceAccountKey;
      if (!key) return undefined;
      return {
        type: 'google-sheets-credentials',
        serviceAccountKey: {
          type: 'service_account',
          project_id: key.project_id,
          client_email: key.client_email,
          ...(key.client_id && { client_id: key.client_id }),
        },
      };
    }
    default:
      return undefined;
  }
}

/** The definition an old row stands for. */
export function definitionIdOfRow(type: DestinationCredentialType): string | undefined {
  if (type === DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT) {
    return GOOGLE_SERVICE_ACCOUNT_DEFINITION_ID;
  }
  return type === DestinationCredentialType.GOOGLE_OAUTH
    ? GOOGLE_SHEETS_OAUTH_DEFINITION_ID
    : undefined;
}

/** A bound Credential's account email: the service account's, else the Google account's. */
export function identityOf(metadata: CredentialPublicMetadata | null): string | null {
  if (!metadata) return null;
  if ('clientEmail' in metadata) return metadata.clientEmail;
  return 'account' in metadata ? metadata.account.email : null;
}

/** Whose grant a picked Drive folder rests on: a Google account by its email, a key by its kind; undefined when unknown. */
export function driveAccountOf(
  definitionId: string | undefined,
  email: string | null | undefined
): string | undefined {
  if (definitionId !== GOOGLE_SHEETS_OAUTH_DEFINITION_ID) return definitionId;
  return email ? `${definitionId}:${email.toLowerCase()}` : undefined;
}
