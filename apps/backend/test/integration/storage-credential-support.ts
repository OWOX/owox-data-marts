import type * as supertest from 'supertest';
import { AUTH_HEADER } from '@owox/test-utils';
import type { DataStorageType } from 'src/data-marts/data-storage-types/enums/data-storage-type.enum';
import type { StoredStorageCredentials } from 'src/data-marts/entities/stored-storage-credentials.type';
// Legacy: builds Credentials from old-shaped keys; rewrite when the old key mapping is removed.
import { fromStoredStorageCredentials } from 'src/data-marts/services/storage-credential-conversion/legacy-storage-credential-definitions';
import { resolveStorageCredentialType } from 'src/data-marts/services/credential-type-resolver';

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
