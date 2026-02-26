import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { StorageCredentialType } from '../enums/storage-credential-type.enum';
import { DestinationCredentialType } from '../enums/destination-credential-type.enum';
import type { CredentialIdentity } from '../entities/credential-identity.type';
import type { StoredStorageCredentials } from '../entities/stored-storage-credentials.type';
import type { StoredDestinationCredentials } from '../entities/stored-destination-credentials.type';

export function resolveStorageCredentialType(
  storageType: DataStorageType,
  credentials: StoredStorageCredentials
): StorageCredentialType {
  switch (storageType) {
    case DataStorageType.GOOGLE_BIGQUERY:
    case DataStorageType.LEGACY_GOOGLE_BIGQUERY:
      return StorageCredentialType.GOOGLE_SERVICE_ACCOUNT;
    case DataStorageType.AWS_ATHENA:
    case DataStorageType.AWS_REDSHIFT:
      return StorageCredentialType.AWS_IAM;
    case DataStorageType.SNOWFLAKE:
      if ('authMethod' in credentials && credentials.authMethod === 'KEY_PAIR')
        return StorageCredentialType.SNOWFLAKE_KEY_PAIR;
      return StorageCredentialType.SNOWFLAKE_PASSWORD;
    case DataStorageType.DATABRICKS:
      return StorageCredentialType.DATABRICKS_PAT;
    default:
      throw new Error(`Unknown storage type: ${String(storageType)}`);
  }
}

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
    default:
      throw new Error(`Unknown destination credential type: ${String(credType)}`);
  }
}

export function extractStorageIdentity(
  type: StorageCredentialType,
  credentials: StoredStorageCredentials
): CredentialIdentity | null {
  switch (type) {
    case StorageCredentialType.GOOGLE_SERVICE_ACCOUNT:
      return 'client_email' in credentials
        ? { clientEmail: credentials.client_email as string }
        : null;
    case StorageCredentialType.SNOWFLAKE_PASSWORD:
    case StorageCredentialType.SNOWFLAKE_KEY_PAIR:
      return 'username' in credentials ? { username: credentials.username as string } : null;
    case StorageCredentialType.AWS_IAM:
      return 'accessKeyId' in credentials
        ? { accessKeyId: credentials.accessKeyId as string }
        : null;
    default:
      return null;
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
