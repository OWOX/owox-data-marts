import { StorageCredentialType } from '../../enums/storage-credential-type.enum';
import type { StoredStorageCredentials } from '../../entities/stored-storage-credentials.type';
import type {
  CredentialPublicMetadata,
  CredentialSecret,
} from '../../credentials/credential.types';
import { adapterFieldsOf } from '../../data-storage-types/storage-credential-definitions';

const DEFINITION_ID_BY_TYPE: Record<StorageCredentialType, string> = {
  [StorageCredentialType.GOOGLE_SERVICE_ACCOUNT]: 'google-service-account',
  [StorageCredentialType.GOOGLE_OAUTH]: 'google-oauth',
  [StorageCredentialType.AWS_IAM]: 'aws-access-key',
  [StorageCredentialType.SNOWFLAKE_PASSWORD]: 'snowflake-password',
  [StorageCredentialType.SNOWFLAKE_KEY_PAIR]: 'snowflake-key-pair',
  [StorageCredentialType.DATABRICKS_PAT]: 'databricks-token',
};

/** The stored type already names the definition; `stored` is accepted for call-site symmetry. */
export function definitionIdForStorageCredentialType(
  type: StorageCredentialType,
  _stored: StoredStorageCredentials
): string {
  return DEFINITION_ID_BY_TYPE[type];
}

export function fromStoredStorageCredentials(
  type: StorageCredentialType,
  stored: StoredStorageCredentials
): {
  definitionId: string;
  secret: CredentialSecret;
  publicMetadata: CredentialPublicMetadata | null;
} {
  if (type === StorageCredentialType.GOOGLE_OAUTH) {
    throw new Error('Google OAuth credentials have no adapter shape');
  }
  const definitionId = definitionIdForStorageCredentialType(type, stored);
  if (type === StorageCredentialType.GOOGLE_SERVICE_ACCOUNT) {
    const key = stored as { client_email: string; project_id: string; private_key_id: string };
    return {
      definitionId,
      secret: { value: JSON.stringify(stored) },
      publicMetadata: {
        clientEmail: key.client_email,
        projectId: key.project_id,
        privateKeyId: key.private_key_id,
      },
    };
  }
  const values = stored as unknown as Record<string, string | null | undefined>;
  const secretFields: Record<string, string> = {};
  const publicFields: Record<string, string> = {};
  for (const field of adapterFieldsOf(definitionId)) {
    const value = values[field.key];
    // Adapters treat an empty value as absent; a kept '' would fail every later fields update.
    if (value?.trim()) (field.secret ? secretFields : publicFields)[field.key] = value;
  }
  return {
    definitionId,
    secret: { fields: secretFields },
    publicMetadata: Object.keys(publicFields).length ? { fields: publicFields } : null,
  };
}
