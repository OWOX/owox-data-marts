import type * as supertest from 'supertest';
import { AUTH_HEADER } from '@owox/test-utils';
import { DataStorageType } from 'src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { StorageCredentialType } from 'src/data-marts/enums/storage-credential-type.enum';
import type { StoredStorageCredentials } from 'src/data-marts/entities/stored-storage-credentials.type';
// Legacy: builds Credentials from old-shaped keys; rewrite when the old key mapping is removed.
import { fromStoredStorageCredentials } from 'src/data-marts/services/storage-credential-conversion/legacy-storage-credential-definitions';

/** Saves a Storage key as a Credential and returns its id for `reusableCredentialId`. */
export async function createStorageCredential(
  agent: supertest.Agent,
  storageType: DataStorageType,
  key: Record<string, unknown>
): Promise<string> {
  const stored = key as unknown as StoredStorageCredentials;
  const { definitionId, secret, publicMetadata } = fromStoredStorageCredentials(
    resolveStorageCredentialType(storageType, stored),
    stored
  );
  const values =
    'fields' in secret
      ? {
          fields: {
            ...secret.fields,
            ...(publicMetadata && 'fields' in publicMetadata ? publicMetadata.fields : {}),
          },
        }
      : { secret };
  const response = await agent
    .post('/api/credentials')
    .set(AUTH_HEADER)
    .send({ title: `${storageType} integration`, definitionId, ...values });
  if (response.status !== 201) {
    throw new Error(`Credential create failed: ${JSON.stringify(response.body)}`);
  }
  return response.body.id as string;
}

function resolveStorageCredentialType(
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
