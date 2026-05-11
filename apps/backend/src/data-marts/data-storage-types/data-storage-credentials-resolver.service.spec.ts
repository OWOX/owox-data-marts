import { Repository } from 'typeorm';
import { DataStorageCredentialsResolver } from './data-storage-credentials-resolver.service';
import { GoogleOAuthClientService } from '../services/google-oauth/google-oauth-client.service';
import { DataStorageCredentialService } from '../services/data-storage-credential.service';
import { DataStorage } from '../entities/data-storage.entity';
import { DataStorageCredential } from '../entities/data-storage-credential.entity';
import { StorageCredentialType } from '../enums/storage-credential-type.enum';
import { BIGQUERY_OAUTH_TYPE } from './bigquery/schemas/bigquery-credentials.schema';

describe('DataStorageCredentialsResolver', () => {
  let resolver: DataStorageCredentialsResolver;
  let oauthClient: jest.Mocked<Pick<GoogleOAuthClientService, 'getStorageOAuth2Client'>>;
  let storageRepo: jest.Mocked<Pick<Repository<DataStorage>, 'findOne'>>;
  let credentialService: jest.Mocked<Pick<DataStorageCredentialService, 'getById'>>;

  beforeEach(() => {
    oauthClient = { getStorageOAuth2Client: jest.fn() };
    storageRepo = { findOne: jest.fn() };
    credentialService = { getById: jest.fn() };
    resolver = new DataStorageCredentialsResolver(
      oauthClient as unknown as GoogleOAuthClientService,
      storageRepo as unknown as Repository<DataStorage>,
      credentialService as unknown as DataStorageCredentialService
    );
  });

  function makeServiceAccountCredential(
    overrides: Partial<DataStorageCredential> = {}
  ): DataStorageCredential {
    return {
      id: 'cred-1',
      projectId: 'p1',
      type: StorageCredentialType.GOOGLE_SERVICE_ACCOUNT,
      credentials: { type: 'service_account', project_id: 'p1' },
      ...overrides,
    } as unknown as DataStorageCredential;
  }

  function makeStorage(overrides: Partial<DataStorage> = {}): DataStorage {
    return {
      id: 'storage-1',
      credentialId: 'cred-1',
      ...overrides,
    } as unknown as DataStorage;
  }

  describe('resolve()', () => {
    it('returns credentials from eager-loaded storage.credential without touching the service', async () => {
      const credential = makeServiceAccountCredential();
      const storage = makeStorage({ credential });

      const result = await resolver.resolve(storage);

      expect(result).toEqual({ type: 'service_account', project_id: 'p1' });
      expect(credentialService.getById).not.toHaveBeenCalled();
    });

    it('refetches credential when storage.credential is null but credentialId is set', async () => {
      // Reproduces the post-typeorm-0.3.29 hydration glitch: eager OneToOne + DeleteDateColumn
      // can leave `storage.credential` null even though the row exists. The resolver must
      // refetch instead of throwing "Storage credentials are not configured".
      const credential = makeServiceAccountCredential();
      const storage = makeStorage({ credential: null, credentialId: 'cred-1' });
      credentialService.getById.mockResolvedValue(credential);

      const result = await resolver.resolve(storage);

      expect(credentialService.getById).toHaveBeenCalledWith('cred-1');
      expect(result).toEqual({ type: 'service_account', project_id: 'p1' });
    });

    it('throws "Storage credentials are not configured" when credentialId is missing', async () => {
      const storage = makeStorage({ credential: null, credentialId: null });

      await expect(resolver.resolve(storage)).rejects.toThrow(
        'Storage credentials are not configured'
      );
      expect(credentialService.getById).not.toHaveBeenCalled();
    });

    it('throws when credentialId points to a row the service cannot find (e.g. soft-deleted)', async () => {
      const storage = makeStorage({ credential: null, credentialId: 'cred-deleted' });
      credentialService.getById.mockResolvedValue(null);

      await expect(resolver.resolve(storage)).rejects.toThrow(
        'Storage credentials are not configured'
      );
      expect(credentialService.getById).toHaveBeenCalledWith('cred-deleted');
    });

    it('returns OAuth2 client wrapper for GOOGLE_OAUTH credentials', async () => {
      const credential = makeServiceAccountCredential({
        type: StorageCredentialType.GOOGLE_OAUTH,
      });
      const storage = makeStorage({ credential });
      const oauth2Client = { dummy: true };
      oauthClient.getStorageOAuth2Client.mockResolvedValue(oauth2Client as never);

      const result = await resolver.resolve(storage);

      expect(oauthClient.getStorageOAuth2Client).toHaveBeenCalledWith('storage-1');
      expect(result).toEqual({ type: BIGQUERY_OAUTH_TYPE, oauth2Client });
    });

    it('uses refetched credential to dispatch into the OAuth path when eager load was null', async () => {
      const credential = makeServiceAccountCredential({
        type: StorageCredentialType.GOOGLE_OAUTH,
      });
      const storage = makeStorage({ credential: null, credentialId: 'cred-1' });
      credentialService.getById.mockResolvedValue(credential);
      const oauth2Client = { dummy: true };
      oauthClient.getStorageOAuth2Client.mockResolvedValue(oauth2Client as never);

      const result = await resolver.resolve(storage);

      expect(credentialService.getById).toHaveBeenCalledWith('cred-1');
      expect(oauthClient.getStorageOAuth2Client).toHaveBeenCalledWith('storage-1');
      expect(result).toEqual({ type: BIGQUERY_OAUTH_TYPE, oauth2Client });
    });
  });

  describe('resolveById()', () => {
    it('throws when storage row does not exist', async () => {
      storageRepo.findOne.mockResolvedValue(null);

      await expect(resolver.resolveById('missing')).rejects.toThrow('Storage not found: missing');
    });

    it('delegates to resolve() with the loaded storage', async () => {
      const credential = makeServiceAccountCredential();
      const storage = makeStorage({ credential });
      storageRepo.findOne.mockResolvedValue(storage);

      const result = await resolver.resolveById('storage-1');

      expect(storageRepo.findOne).toHaveBeenCalledWith({ where: { id: 'storage-1' } });
      expect(result).toEqual({ type: 'service_account', project_id: 'p1' });
    });
  });
});
