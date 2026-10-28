import { HttpStatus, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DataStorageCredentialsResolver } from './data-storage-credentials-resolver.service';
import { GoogleOAuthClientService } from '../services/google-oauth/google-oauth-client.service';
import { DataStorageCredentialService } from '../services/data-storage-credential.service';
import { DataStorage } from '../entities/data-storage.entity';
import { DataStorageCredential } from '../entities/data-storage-credential.entity';
import { StorageCredentialType } from '../enums/storage-credential-type.enum';
import { BIGQUERY_OAUTH_TYPE } from './bigquery/schemas/bigquery-credentials.schema';
import { GoogleOAuthConfigService } from '../services/google-oauth/google-oauth-config.service';
import type {
  ResolvedStorageCredential,
  StorageCredentialBindingService,
} from './storage-credential-binding.service';
import {
  CredentialsExpiredException,
  GoogleOAuthException,
} from '../exceptions/google-oauth.exceptions';
import { StorageCredentialUnavailableException } from '../exceptions/storage-credential-unavailable.exception';
import { DataStorageType } from './enums/data-storage-type.enum';
import { LegacyStorageCredentialReader } from '../services/storage-credential-conversion/legacy-storage-credential-reader.service';

const NO_KEY = 'This Storage has no Credential. Select one in the Storage settings.';

describe('DataStorageCredentialsResolver', () => {
  let resolver: DataStorageCredentialsResolver;
  let oauthClient: jest.Mocked<Pick<GoogleOAuthClientService, 'getStorageOAuth2Client'>>;
  let storageRepo: jest.Mocked<Pick<Repository<DataStorage>, 'findOne'>>;
  let credentialService: jest.Mocked<Pick<DataStorageCredentialService, 'getById'>>;
  let facade: jest.Mocked<
    Pick<
      StorageCredentialBindingService,
      | 'resolveForStorage'
      | 'getGoogleOAuth2Client'
      | 'markStorageUsed'
      | 'findBoundStorageIds'
      | 'summarizeForStorages'
    >
  >;
  let oauthConfig: jest.Mocked<Pick<GoogleOAuthConfigService, 'getStorageClientId'>>;
  let legacy: LegacyStorageCredentialReader;

  beforeEach(() => {
    oauthClient = { getStorageOAuth2Client: jest.fn() };
    storageRepo = { findOne: jest.fn() };
    credentialService = { getById: jest.fn() };
    facade = {
      resolveForStorage: jest.fn().mockResolvedValue(null),
      getGoogleOAuth2Client: jest.fn(),
      markStorageUsed: jest.fn().mockResolvedValue(undefined),
      findBoundStorageIds: jest.fn().mockResolvedValue(new Set()),
      summarizeForStorages: jest.fn().mockResolvedValue(new Map()),
    };
    oauthConfig = { getStorageClientId: jest.fn().mockReturnValue('storage-client') };
    legacy = new LegacyStorageCredentialReader(
      {} as never,
      credentialService as unknown as DataStorageCredentialService,
      oauthClient as unknown as GoogleOAuthClientService,
      oauthConfig as unknown as GoogleOAuthConfigService
    );
    jest.spyOn(legacy, 'storageIdsOnOldKey').mockResolvedValue(new Set());
    resolver = new DataStorageCredentialsResolver(
      storageRepo as unknown as Repository<DataStorage>,
      facade as unknown as StorageCredentialBindingService,
      legacy
    );
  });

  afterEach(() => jest.restoreAllMocks());

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
      // refetch instead of refusing the Storage as one without a key.
      const credential = makeServiceAccountCredential();
      const storage = makeStorage({ credential: null, credentialId: 'cred-1' });
      credentialService.getById.mockResolvedValue(credential);

      const result = await resolver.resolve(storage);

      expect(credentialService.getById).toHaveBeenCalledWith('cred-1');
      expect(result).toEqual({ type: 'service_account', project_id: 'p1' });
    });

    it('refuses a Storage with neither a Credential nor an old key', async () => {
      const storage = makeStorage({ credential: null, credentialId: null });

      await expect(resolver.resolve(storage)).rejects.toThrow(
        new StorageCredentialUnavailableException(NO_KEY, false)
      );
      expect(credentialService.getById).not.toHaveBeenCalled();
    });

    it('throws when credentialId points to a row the service cannot find (e.g. soft-deleted)', async () => {
      const storage = makeStorage({ credential: null, credentialId: 'cred-deleted' });
      credentialService.getById.mockResolvedValue(null);

      await expect(resolver.resolve(storage)).rejects.toThrow(
        new StorageCredentialUnavailableException(NO_KEY, false)
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
      expect(result).toEqual({
        type: BIGQUERY_OAUTH_TYPE,
        oauth2Client,
        oauthClientId: 'storage-client',
      });
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
      expect(result).toEqual({
        type: BIGQUERY_OAUTH_TYPE,
        oauth2Client,
        oauthClientId: 'storage-client',
      });
    });
  });

  describe('resolve() for a bound Storage', () => {
    const lostGrant =
      "This Storage's Credential lost Google authorization. A Credential maintainer can reconnect it on the Credentials page.";

    function bound(overrides: Partial<ResolvedStorageCredential> = {}): ResolvedStorageCredential {
      return {
        credentialId: 'c1',
        title: 'Main',
        definitionId: 'snowflake-key-pair',
        state: 'ready',
        secret: { fields: { privateKey: 'pk' } },
        publicMetadata: { fields: { username: 'u' } },
        ...overrides,
      } as ResolvedStorageCredential;
    }

    const googleAccount = (overrides: Partial<ResolvedStorageCredential> = {}) =>
      bound({
        definitionId: 'google-oauth',
        secret: { oauth: {} } as never,
        publicMetadata: { scopes: ['bq'] } as never,
        ...overrides,
      });

    const storage = () => makeStorage({ projectId: 'p1', credentialId: 'old-row' } as never);

    it('returns the adapter shape of a snowflake key pair and records the use', async () => {
      facade.resolveForStorage.mockResolvedValue(bound());
      const snowflake = storage();

      await expect(resolver.resolve(snowflake)).resolves.toEqual({
        authMethod: 'KEY_PAIR',
        privateKey: 'pk',
        username: 'u',
      });
      expect(facade.resolveForStorage).toHaveBeenCalledWith(snowflake);
      expect(facade.markStorageUsed).toHaveBeenCalledWith('storage-1', 'c1');
    });

    it('never falls back to the old row when the Credential is disabled', async () => {
      facade.resolveForStorage.mockResolvedValue(bound({ state: 'disabled' }));

      const error = await resolver.resolve(storage()).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(StorageCredentialUnavailableException);
      expect(error).toMatchObject({
        message:
          "This Storage's Credential is disabled. A Credential maintainer can enable it on the Credentials page.",
        code: 'STORAGE_CREDENTIAL_UNAVAILABLE',
        errorDetails: { reauthRequired: false },
      });
      expect(credentialService.getById).not.toHaveBeenCalled();
      expect(oauthClient.getStorageOAuth2Client).not.toHaveBeenCalled();
    });

    it('reports the lost grant of a rejected Google account', async () => {
      facade.resolveForStorage.mockResolvedValue(googleAccount({ state: 'reconnect-required' }));

      await expect(resolver.resolve(storage())).rejects.toThrow(lostGrant);
      expect(facade.getGoogleOAuth2Client).not.toHaveBeenCalled();
    });

    it('reports the missing permissions of a Google account without a BigQuery scope', async () => {
      facade.resolveForStorage.mockResolvedValue(googleAccount({ state: 'reauthorize-required' }));

      await expect(resolver.resolve(storage())).rejects.toThrow(
        "This Storage's Credential lacks the Google permissions this Storage needs. A Credential maintainer can reconnect it on the Credentials page to grant them."
      );
    });

    it('stops a BigQuery Google account with its own error while Google sign-in is not configured', async () => {
      facade.resolveForStorage.mockResolvedValue(googleAccount({ state: 'not-configured' }));

      const error = await resolver.resolve(storage()).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(StorageCredentialUnavailableException);
      expect(error).toMatchObject({
        message:
          'BigQuery Google account Credentials cannot be used because Google sign-in is not configured on this server.',
        code: 'STORAGE_CREDENTIAL_UNAVAILABLE',
        errorDetails: { reauthRequired: false },
      });
      expect(facade.getGoogleOAuth2Client).not.toHaveBeenCalled();
    });

    it('returns the OAuth client of a ready Google account', async () => {
      const client = { dummy: true };
      facade.resolveForStorage.mockResolvedValue(googleAccount());
      facade.getGoogleOAuth2Client.mockResolvedValue({ client, clientId: 'cid' } as never);

      await expect(resolver.resolve(storage())).resolves.toEqual({
        type: BIGQUERY_OAUTH_TYPE,
        oauth2Client: client,
        oauthClientId: 'cid',
      });
      expect(facade.getGoogleOAuth2Client).toHaveBeenCalledWith('p1', 'c1');
    });

    it('turns an expired grant found during refresh into the lost-grant error, not a 401', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      facade.resolveForStorage.mockResolvedValue(googleAccount());
      facade.getGoogleOAuth2Client.mockRejectedValue(
        new CredentialsExpiredException('c1', 'credential')
      );

      const error = await resolver.resolve(storage()).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(StorageCredentialUnavailableException);
      expect(error).toMatchObject({
        message: lostGrant,
        code: 'STORAGE_CREDENTIAL_UNAVAILABLE',
        errorDetails: { reauthRequired: true },
      });
      expect(credentialService.getById).not.toHaveBeenCalled();
    });

    it("reports the lost grant when the grant's OAuth client is no longer configured", async () => {
      facade.resolveForStorage.mockResolvedValue(googleAccount());
      facade.getGoogleOAuth2Client.mockRejectedValue(
        new GoogleOAuthException(
          'OAuth client is no longer configured.',
          'OAUTH_NOT_CONFIGURED',
          HttpStatus.SERVICE_UNAVAILABLE
        )
      );

      const error = await resolver.resolve(storage()).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(StorageCredentialUnavailableException);
      expect(error).toMatchObject({
        message: lostGrant,
        code: 'STORAGE_CREDENTIAL_UNAVAILABLE',
        errorDetails: { reauthRequired: true },
      });
    });

    it('says the key could not be read, without quoting it, for a corrupt service account key', async () => {
      facade.resolveForStorage.mockResolvedValue(
        bound({
          definitionId: 'google-service-account',
          secret: { value: '{"private_key": "TOPSECRET' },
        })
      );

      const error = await resolver.resolve(storage()).catch((e: unknown) => e);

      expect((error as Error).message).toBe(
        "The stored key of this Storage's Credential could not be read"
      );
      expect(JSON.stringify(error)).not.toContain('TOPSECRET');
    });
  });

  describe('hasCredentials()', () => {
    it('is true for a bound Storage without an old row', async () => {
      facade.findBoundStorageIds.mockResolvedValue(new Set(['storage-1']));

      await expect(
        resolver.hasCredentials(makeStorage({ projectId: 'p1', credentialId: null }))
      ).resolves.toBe(true);
    });

    it('is true for an unbound Storage with an old row and false with neither', async () => {
      await expect(resolver.hasCredentials(makeStorage({ projectId: 'p1' }))).resolves.toBe(true);
      await expect(
        resolver.hasCredentials(makeStorage({ projectId: 'p1', credentialId: null }))
      ).resolves.toBe(false);
    });
  });

  describe('summarize()', () => {
    const storages = [
      makeStorage({ id: 'bq', type: DataStorageType.GOOGLE_BIGQUERY }),
      makeStorage({ id: 'legacy', type: DataStorageType.LEGACY_GOOGLE_BIGQUERY }),
      makeStorage({ id: 'snow', type: DataStorageType.SNOWFLAKE }),
    ];

    it('asks for the summaries of the Storages by id and type', async () => {
      await resolver.summarize('p1', 'user-1', ['editor'], storages);

      expect(facade.summarizeForStorages).toHaveBeenCalledWith({
        projectId: 'p1',
        userId: 'user-1',
        roles: ['editor'],
        storages: [
          { id: 'bq', type: DataStorageType.GOOGLE_BIGQUERY },
          { id: 'legacy', type: DataStorageType.LEGACY_GOOGLE_BIGQUERY },
          { id: 'snow', type: DataStorageType.SNOWFLAKE },
        ],
      });
    });

    it('marks an unconverted Storage pending and leaves one with neither key nor binding out', async () => {
      const bound = { access: 'restricted', state: 'disabled' } as const;
      facade.summarizeForStorages.mockResolvedValue(new Map([['bq', bound]]));
      const onOldKey = jest.mocked(legacy.storageIdsOnOldKey);
      onOldKey.mockResolvedValue(new Set(['legacy']));

      const summaries = await resolver.summarize(
        'p1',
        'user-1',
        ['editor'],
        [
          ...storages,
          makeStorage({ id: 'keyless', type: DataStorageType.SNOWFLAKE, credentialId: null }),
        ]
      );

      // Only unbound Storages with an old row are asked about.
      expect(onOldKey).toHaveBeenCalledWith(['legacy', 'snow']);
      expect(Object.fromEntries(summaries)).toEqual({
        bq: bound,
        legacy: { access: 'pending', state: 'ready' },
      });
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
