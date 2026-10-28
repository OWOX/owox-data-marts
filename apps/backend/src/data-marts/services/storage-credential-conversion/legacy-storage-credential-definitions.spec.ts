import { StorageCredentialType } from '../../enums/storage-credential-type.enum';
import type { StoredStorageCredentials } from '../../entities/stored-storage-credentials.type';
import { toAdapterCredentials } from '../../data-storage-types/storage-credential-definitions';
import {
  definitionIdForStorageCredentialType,
  fromStoredStorageCredentials,
} from './legacy-storage-credential-definitions';

const serviceAccount = {
  type: 'service_account',
  project_id: 'p',
  private_key_id: 'k',
  private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
  client_email: 'sa@p.iam.gserviceaccount.com',
  client_id: '1',
} as unknown as StoredStorageCredentials;

describe('legacy storage credential definitions', () => {
  it('rejects google-oauth', () => {
    expect(() =>
      fromStoredStorageCredentials(
        StorageCredentialType.GOOGLE_OAUTH,
        {} as StoredStorageCredentials
      )
    ).toThrow();
  });

  it.each<[StorageCredentialType, StoredStorageCredentials, string]>([
    [StorageCredentialType.GOOGLE_SERVICE_ACCOUNT, serviceAccount, 'google-service-account'],
    [
      StorageCredentialType.AWS_IAM,
      { accessKeyId: 'a', secretAccessKey: 's', sessionToken: 't' },
      'aws-access-key',
    ],
    [
      StorageCredentialType.SNOWFLAKE_PASSWORD,
      { authMethod: 'PASSWORD', username: 'u', password: 'p' } as StoredStorageCredentials,
      'snowflake-password',
    ],
    [
      StorageCredentialType.SNOWFLAKE_KEY_PAIR,
      {
        authMethod: 'KEY_PAIR',
        username: 'u',
        privateKey: 'k',
        privateKeyPassphrase: 'pp',
      } as StoredStorageCredentials,
      'snowflake-key-pair',
    ],
    [
      StorageCredentialType.DATABRICKS_PAT,
      { authMethod: 'PERSONAL_ACCESS_TOKEN', token: 't' } as StoredStorageCredentials,
      'databricks-token',
    ],
  ])('round-trips %s', (type, stored, definitionId) => {
    expect(definitionIdForStorageCredentialType(type, stored)).toBe(definitionId);
    const out = fromStoredStorageCredentials(type, stored);
    expect(out.definitionId).toBe(definitionId);
    expect(toAdapterCredentials(out.definitionId, out.secret, out.publicMetadata)).toEqual(stored);
  });

  it('drops empty and null stored values, which the adapters treat as absent', () => {
    const stored = {
      authMethod: 'KEY_PAIR',
      username: 'u',
      privateKey: 'k',
      privateKeyPassphrase: '',
    } as StoredStorageCredentials;

    const out = fromStoredStorageCredentials(StorageCredentialType.SNOWFLAKE_KEY_PAIR, stored);

    expect(out.secret).toEqual({ fields: { privateKey: 'k' } });
    expect(toAdapterCredentials(out.definitionId, out.secret, out.publicMetadata)).toEqual({
      authMethod: 'KEY_PAIR',
      username: 'u',
      privateKey: 'k',
    });
    for (const sessionToken of [' ', null]) {
      expect(
        fromStoredStorageCredentials(StorageCredentialType.AWS_IAM, {
          accessKeyId: 'a',
          secretAccessKey: 's',
          sessionToken,
        } as unknown as StoredStorageCredentials).secret
      ).toEqual({ fields: { secretAccessKey: 's' } });
    }
  });

  it('puts secret fields in the secret and the rest in public metadata', () => {
    const out = fromStoredStorageCredentials(StorageCredentialType.AWS_IAM, {
      accessKeyId: 'a',
      secretAccessKey: 's',
    });
    expect(out.secret).toEqual({ fields: { secretAccessKey: 's' } });
    expect(out.publicMetadata).toEqual({ fields: { accessKeyId: 'a' } });
  });
});
