jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource, type Repository } from 'typeorm';
import { CREDENTIAL_VALIDATION_ENTITIES } from '../../../test/fixtures/credential-validation-writes';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { CredentialConsumerBinding } from '../credentials/entities/credential-consumer-binding.entity';
import { CredentialContext } from '../credentials/entities/credential-context.entity';
import { CredentialOwner } from '../credentials/entities/credential-owner.entity';
import { Credential } from '../credentials/entities/credential.entity';
import { CredentialMapper } from '../credentials/mappers/credential.mapper';
import { CredentialBindingService } from '../credentials/services/credential-binding.service';
import { requirementRevision } from '../credentials/services/credential-requirement-revision';
import { CredentialDefinitionService } from '../credentials/services/credential-definition.service';
import { CredentialViewService } from '../credentials/services/credential-view.service';
import { CredentialService } from '../credentials/services/credential.service';
import { DeleteCredentialService } from '../credentials/use-cases/delete-credential.service';
import { Context } from '../entities/context.entity';
import { Action, EntityType } from '../services/access-decision';
import { StorageCredentialBindingService } from './storage-credential-binding.service';
import { DataStorageType } from './enums/data-storage-type.enum';

const BIGQUERY_SCOPE = 'https://www.googleapis.com/auth/bigquery';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

describe('StorageCredentialBindingService', () => {
  let dataSource: DataSource;
  let credentials: Repository<Credential>;
  let bindings: Repository<CredentialConsumerBinding>;
  let contexts: Repository<Context>;
  let credentialService: CredentialService;
  let definitions: CredentialDefinitionService;
  let access: { canAccess: jest.Mock; canAccessMany: jest.Mock };
  let googleOAuth: { getOAuth2Client: jest.Mock };
  let googleOAuthConfig: { isClientConfigured: jest.Mock; getScopes: jest.Mock };
  let storageCredentials: StorageCredentialBindingService;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [...CREDENTIAL_VALIDATION_ENTITIES, CredentialConsumerBinding],
      synchronize: true,
      logging: false,
    });
    await dataSource.initialize();
  });

  afterAll(() => dataSource.destroy());

  afterEach(() => jest.restoreAllMocks());

  beforeEach(async () => {
    for (const entity of [
      CredentialConsumerBinding,
      CredentialContext,
      CredentialOwner,
      Credential,
      Context,
    ]) {
      await dataSource.getRepository(entity).createQueryBuilder().delete().execute();
    }
    credentials = dataSource.getRepository(Credential);
    bindings = dataSource.getRepository(CredentialConsumerBinding);
    contexts = dataSource.getRepository(Context);
    credentialService = new CredentialService(
      credentials,
      bindings,
      dataSource.getRepository(CredentialOwner),
      dataSource.getRepository(CredentialContext),
      {} as never,
      {} as never
    );
    // Built-in definitions resolve without touching the external-definition tables.
    definitions = new CredentialDefinitionService({} as never, {} as never);
    access = {
      canAccess: jest.fn().mockResolvedValue(true),
      canAccessMany: jest.fn(
        async (_userId: string, _roles: string[], _type: EntityType, ids: string[]) =>
          new Map(ids.map(id => [id, true]))
      ),
    };
    googleOAuth = { getOAuth2Client: jest.fn().mockResolvedValue({ client: {}, clientId: 'c' }) };
    const binder = new CredentialBindingService(
      bindings,
      credentials,
      dataSource.getRepository(CredentialContext),
      access as never,
      credentialService
    );
    googleOAuthConfig = {
      isClientConfigured: jest.fn().mockReturnValue(true),
      getScopes: jest.fn().mockReturnValue([BIGQUERY_SCOPE, 'openid', 'email', 'profile']),
    };
    storageCredentials = new StorageCredentialBindingService(
      binder,
      definitions,
      access as never,
      credentialService,
      googleOAuth as never,
      googleOAuthConfig as never
    );
  });

  function givenCredential(overrides: Partial<Credential> = {}): Promise<Credential> {
    return credentials.save(
      credentials.create({
        projectId: 'project-1',
        title: 'Warehouse key',
        definitionSource: 'builtin',
        definitionId: 'google-service-account',
        secret: { value: 'service-account-key' },
        publicMetadata: {
          clientEmail: 'loader@warehouse.iam.gserviceaccount.com',
          projectId: 'warehouse',
          privateKeyId: 'key-1',
        },
        ...overrides,
      })
    );
  }

  function givenGoogleAccount(overrides: Partial<Credential> = {}): Promise<Credential> {
    return givenCredential({
      title: 'Ann at Google',
      definitionId: 'google-oauth',
      secret: {
        oauth: {
          provider: 'google',
          clientId: 'storage-client',
          tokens: { access_token: 'access', token_type: 'Bearer', scope: BIGQUERY_SCOPE },
        },
      },
      publicMetadata: {
        account: { email: 'ann@example.com', name: 'Ann', picture: null },
        scopes: [BIGQUERY_SCOPE],
      },
      ...overrides,
    });
  }

  function bind(credentialId: string, overrides: Record<string, unknown> = {}) {
    return storageCredentials.bindStorage({
      projectId: 'project-1',
      userId: 'member-1',
      roles: ['editor'],
      storageId: 'storage-1',
      type: DataStorageType.GOOGLE_BIGQUERY,
      credentialId,
      ...overrides,
    });
  }

  function storage(id = 'storage-1', projectId = 'project-1') {
    return { id, projectId, type: DataStorageType.GOOGLE_BIGQUERY };
  }

  function storageRows(storageId = 'storage-1') {
    return bindings.find({ where: { consumerType: 'storage', consumerId: storageId } });
  }

  describe('bindStorage', () => {
    it('binds the Storage through one storage requirement checked against USE', async () => {
      const credential = await givenCredential();

      await bind(credential.id);

      const snapshot = {
        definitionIds: ['google-service-account', 'google-oauth'],
        scopes: [BIGQUERY_SCOPE],
      };
      expect(await storageRows()).toEqual([
        expect.objectContaining({
          projectId: 'project-1',
          credentialId: credential.id,
          requirementKey: 'storage',
          requirementSnapshot: snapshot,
          requirementRevision: requirementRevision(snapshot),
          configuredById: 'member-1',
          active: true,
        }),
      ]);
      expect(access.canAccess).toHaveBeenCalledWith(
        'member-1',
        ['editor'],
        EntityType.CREDENTIAL,
        credential.id,
        Action.USE,
        'project-1'
      );
    });

    it('keeps exactly one active row per Storage, and its revision, when it is rebound', async () => {
      const first = await givenCredential();
      const second = await givenGoogleAccount();
      await bind(first.id);
      const [{ requirementSnapshot, requirementRevision: revision }] = await storageRows();
      await bindings.update({ consumerId: 'storage-1' }, { lastUsedAt: new Date() });
      await storageCredentials.deactivateStorage('storage-1');

      await bind(second.id);
      await bind(second.id);

      expect(await storageRows()).toEqual([
        expect.objectContaining({
          credentialId: second.id,
          active: true,
          lastUsedAt: null,
          requirementSnapshot,
          requirementRevision: revision,
        }),
      ]);
    });

    it('snapshots null scopes while Google sign-in is not configured', async () => {
      googleOAuthConfig.isClientConfigured.mockReturnValue(false);
      const credential = await givenCredential();

      await bind(credential.id);

      const [row] = await storageRows();
      expect(row.requirementSnapshot).toEqual({
        definitionIds: ['google-service-account', 'google-oauth'],
        scopes: null,
      });
      expect(googleOAuthConfig.isClientConfigured).toHaveBeenCalledWith('storage');
      expect(googleOAuthConfig.getScopes).not.toHaveBeenCalled();
    });

    it.each([
      ['belongs to another project', { projectId: 'project-2' }],
      ['is deleted', { deletedAt: new Date() }],
    ])('answers 404 when the Credential %s', async (_case, overrides) => {
      const credential = await givenCredential(overrides);

      await expect(bind(credential.id)).rejects.toBeInstanceOf(NotFoundException);
      expect(await storageRows()).toEqual([]);
    });

    it('refuses an unknown Storage type with its own error', async () => {
      const credential = await givenCredential();

      expect(() => bind(credential.id, { type: 'UNKNOWN' })).toThrow(
        'Unknown Storage type UNKNOWN'
      );
    });

    it('refuses a definition the Storage type does not take', async () => {
      const credential = await givenCredential({ definitionId: 'snowflake-password' });

      await expect(bind(credential.id)).rejects.toThrow(
        new BadRequestException('This Credential cannot be used with this Storage type.')
      );
      expect(await storageRows()).toEqual([]);
    });

    it('refuses a disabled Credential', async () => {
      const credential = await givenCredential({ enabled: false });

      await expect(bind(credential.id)).rejects.toThrow(
        new BadRequestException('This Credential is disabled.')
      );
      expect(await storageRows()).toEqual([]);
    });

    it('updates the row a concurrent first binding inserted after the read', async () => {
      const converted = await givenCredential();
      const chosen = await givenGoogleAccount();
      await bindings.insert({
        projectId: 'project-1',
        credentialId: converted.id,
        consumerType: 'storage',
        consumerId: 'storage-1',
        requirementKey: 'storage',
        requirementSnapshot: { definitionIds: ['google-service-account'], scopes: [] },
        requirementRevision: 'revision',
        configuredById: null,
        active: true,
      });
      jest.spyOn(bindings, 'findOneBy').mockResolvedValueOnce(null);

      await bind(chosen.id);

      expect(await storageRows()).toEqual([
        expect.objectContaining({
          credentialId: chosen.id,
          configuredById: 'member-1',
          active: true,
          requirementSnapshot: {
            definitionIds: ['google-service-account', 'google-oauth'],
            scopes: [BIGQUERY_SCOPE],
          },
        }),
      ]);
    });

    it('refuses a member without USE on the Credential', async () => {
      const credential = await givenCredential();
      access.canAccess.mockResolvedValue(false);

      await expect(bind(credential.id)).rejects.toThrow(
        new ForbiddenException('You cannot use this Credential.')
      );
      expect(await storageRows()).toEqual([]);
    });
  });

  describe('deactivateStorage', () => {
    it('deactivates the binding a moved Storage left in its old project', async () => {
      const credential = await givenCredential();
      await bind(credential.id);
      await bind(credential.id, { storageId: 'storage-2' });

      await storageCredentials.deactivateStorage('storage-1');

      expect(await storageRows()).toEqual([
        expect.objectContaining({ projectId: 'project-1', active: false }),
      ]);
      expect(await storageRows('storage-2')).toEqual([expect.objectContaining({ active: true })]);
    });
  });

  describe('checkStorageBinding', () => {
    function check(credentialId: string) {
      return storageCredentials.checkStorageBinding({
        projectId: 'project-1',
        userId: 'member-1',
        roles: ['editor'],
        credentialId,
        type: DataStorageType.GOOGLE_BIGQUERY,
      });
    }

    it('returns the Credential a bind would use with its state, without binding it', async () => {
      const credential = await givenCredential();

      await expect(check(credential.id)).resolves.toEqual(
        expect.objectContaining({
          credentialId: credential.id,
          definitionId: 'google-service-account',
          state: 'ready',
          secret: { value: 'service-account-key' },
        })
      );
      expect(access.canAccess).toHaveBeenCalledWith(
        'member-1',
        ['editor'],
        EntityType.CREDENTIAL,
        credential.id,
        Action.USE,
        'project-1'
      );
      expect(await storageRows()).toEqual([]);
    });

    it('answers 403 before the definition and enabled checks', async () => {
      const credential = await givenCredential({
        definitionId: 'snowflake-password',
        enabled: false,
      });
      access.canAccess.mockResolvedValue(false);

      await expect(check(credential.id)).rejects.toThrow(
        new ForbiddenException('You cannot use this Credential.')
      );
    });

    it.each([
      [
        'takes another definition',
        { definitionId: 'snowflake-password' },
        'This Credential cannot be used with this Storage type.',
      ],
      ['is disabled', { enabled: false }, 'This Credential is disabled.'],
    ])('refuses a Credential that %s', async (_case, overrides, message) => {
      const credential = await givenCredential(overrides);

      await expect(check(credential.id)).rejects.toThrow(new BadRequestException(message));
    });

    it.each([
      ['belongs to another project', { projectId: 'project-2' }],
      ['is deleted', { deletedAt: new Date() }],
    ])('answers 404 when the Credential %s', async (_case, overrides) => {
      const credential = await givenCredential(overrides);

      await expect(check(credential.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('lockBoundCredentialId', () => {
    it('reads the Credential the active binding of the project names now', async () => {
      const first = await givenCredential();
      const second = await givenGoogleAccount();
      await expect(
        storageCredentials.lockBoundCredentialId('project-1', 'storage-1')
      ).resolves.toBeNull();

      await bind(first.id);
      await bind(second.id);

      await expect(
        storageCredentials.lockBoundCredentialId('project-1', 'storage-1')
      ).resolves.toBe(second.id);
      await expect(
        storageCredentials.lockBoundCredentialId('project-2', 'storage-1')
      ).resolves.toBeNull();
      await storageCredentials.deactivateStorage('storage-1');
      await expect(
        storageCredentials.lockBoundCredentialId('project-1', 'storage-1')
      ).resolves.toBeNull();
    });
  });

  describe('assertCanUseCredential', () => {
    it('refuses a member without USE with the bind message', async () => {
      access.canAccess.mockResolvedValue(false);

      await expect(
        storageCredentials.assertCanUseCredential({
          projectId: 'project-1',
          userId: 'member-1',
          roles: ['editor'],
          credentialId: 'credential-1',
        })
      ).rejects.toThrow(new ForbiddenException('You cannot use this Credential.'));
      expect(access.canAccess).toHaveBeenCalledWith(
        'member-1',
        ['editor'],
        EntityType.CREDENTIAL,
        'credential-1',
        Action.USE,
        'project-1'
      );
    });
  });

  describe('resolveForStorage', () => {
    it('returns the bound Credential to a member without access to it, with no access decision', async () => {
      const credential = await givenCredential();
      await bind(credential.id);
      access.canAccess.mockResolvedValue(false);
      access.canAccessMany.mockResolvedValue(new Map([[credential.id, false]]));
      access.canAccess.mockClear();
      access.canAccessMany.mockClear();

      await expect(storageCredentials.resolveForStorage(storage())).resolves.toEqual({
        credentialId: credential.id,
        title: 'Warehouse key',
        definitionId: 'google-service-account',
        state: 'ready',
        secret: { value: 'service-account-key' },
        publicMetadata: credential.publicMetadata,
      });
      expect(access.canAccess).not.toHaveBeenCalled();
      expect(access.canAccessMany).not.toHaveBeenCalled();
    });

    it('returns a disabled Credential so the caller can name the fix', async () => {
      const credential = await givenCredential();
      await bind(credential.id);
      await credentials.update({ id: credential.id }, { enabled: false });

      await expect(storageCredentials.resolveForStorage(storage())).resolves.toEqual(
        expect.objectContaining({ credentialId: credential.id, state: 'disabled' })
      );
    });

    it.each([
      ['ready without the sign-in scopes the server also asks for', {}, true, 'ready'],
      [
        'reconnect-required once rejected',
        { validationState: 'rejected' as const },
        true,
        'reconnect-required',
      ],
      [
        'reauthorize-required without the BigQuery scope',
        { publicMetadata: { account: { email: 'a@b.c', name: null, picture: null }, scopes: [] } },
        true,
        'reauthorize-required',
      ],
      ['not-configured while Google sign-in is not configured', {}, false, 'not-configured'],
    ])('resolves a Google account that is %s', async (_case, overrides, configured, state) => {
      googleOAuthConfig.isClientConfigured.mockReturnValue(configured);
      const credential = await givenGoogleAccount();
      await bind(credential.id);
      await credentials.update({ id: credential.id }, overrides);

      await expect(storageCredentials.resolveForStorage(storage())).resolves.toMatchObject({
        state,
      });
      if (configured) expect(googleOAuthConfig.getScopes).toHaveBeenCalledWith('bigquery');
      else expect(googleOAuthConfig.getScopes).not.toHaveBeenCalled();
    });

    it('returns null only without an active binding', async () => {
      await expect(storageCredentials.resolveForStorage(storage())).resolves.toBeNull();

      const credential = await givenCredential();
      await bind(credential.id);
      await expect(
        storageCredentials.resolveForStorage(storage('storage-1', 'project-2'))
      ).resolves.toBeNull();

      await storageCredentials.deactivateStorage('storage-1');
      await expect(storageCredentials.resolveForStorage(storage())).resolves.toBeNull();
    });

    it('refuses a run, as for an unusable Credential, when the bound Credential is missing', async () => {
      const credential = await givenCredential();
      await bind(credential.id);
      await credentials.softDelete({ id: credential.id });

      await expect(storageCredentials.resolveForStorage(storage())).rejects.toMatchObject({
        code: 'STORAGE_CREDENTIAL_UNAVAILABLE',
        errorDetails: { reauthRequired: false },
      });
    });
  });

  describe('getGoogleOAuth2Client', () => {
    it('builds the client of an enabled Credential', async () => {
      const credential = await givenGoogleAccount();

      await expect(
        storageCredentials.getGoogleOAuth2Client('project-1', credential.id)
      ).resolves.toEqual({
        client: {},
        clientId: 'c',
      });
      expect(googleOAuth.getOAuth2Client).toHaveBeenCalledWith(credential.id);
    });

    it.each([
      ['disabled', { enabled: false }],
      ['deleted', { deletedAt: new Date() }],
      ['in another project', { projectId: 'project-2' }],
    ])('hands out no client for a Credential that is %s', async (_case, overrides) => {
      const credential = await givenGoogleAccount(overrides);

      await expect(
        storageCredentials.getGoogleOAuth2Client('project-1', credential.id)
      ).rejects.toThrow();
      expect(googleOAuth.getOAuth2Client).not.toHaveBeenCalled();
    });
  });

  describe('summarizeForStorages', () => {
    function summarize(configuredScopes: string[] | null = []) {
      googleOAuthConfig.isClientConfigured.mockReturnValue(configuredScopes !== null);
      googleOAuthConfig.getScopes.mockReturnValue(configuredScopes ?? []);
      return storageCredentials.summarizeForStorages({
        projectId: 'project-1',
        userId: 'member-1',
        roles: ['editor'],
        storages: [
          { id: 'storage-1', type: DataStorageType.GOOGLE_BIGQUERY },
          { id: 'storage-unbound', type: DataStorageType.GOOGLE_BIGQUERY },
        ],
      });
    }

    it('reads the Google scopes for BigQuery Storages only', async () => {
      const snowflake = await givenCredential({
        definitionId: 'snowflake-password',
        secret: { fields: { password: 'p' } },
        publicMetadata: { fields: { username: 'LOADER' } },
      });
      await bind(snowflake.id, { storageId: 'storage-2', type: DataStorageType.SNOWFLAKE });
      googleOAuthConfig.isClientConfigured.mockClear();

      const summaries = await storageCredentials.summarizeForStorages({
        projectId: 'project-1',
        userId: 'member-1',
        roles: ['editor'],
        storages: [{ id: 'storage-2', type: DataStorageType.SNOWFLAKE }],
      });

      expect(summaries.get('storage-2')).toEqual(expect.objectContaining({ state: 'ready' }));
      expect(googleOAuthConfig.isClientConfigured).not.toHaveBeenCalled();
    });

    it('shows the Credential to a member who can see it', async () => {
      const credential = await givenCredential();
      await bind(credential.id);

      const summaries = await summarize();

      expect([...summaries.entries()]).toEqual([
        [
          'storage-1',
          {
            access: 'visible',
            id: credential.id,
            title: 'Warehouse key',
            definitionId: 'google-service-account',
            providerName: 'BigQuery Service Account',
            identity: 'loader@warehouse.iam.gserviceaccount.com',
            state: 'ready',
          },
        ],
      ]);
      expect(access.canAccessMany).toHaveBeenCalledWith(
        'member-1',
        ['editor'],
        EntityType.CREDENTIAL,
        [credential.id],
        Action.SEE,
        'project-1'
      );
    });

    it('restricts the summary to the state for a member without SEE', async () => {
      const credential = await givenCredential();
      await bind(credential.id);
      await credentials.update({ id: credential.id }, { enabled: false });
      access.canAccessMany.mockResolvedValue(new Map([[credential.id, false]]));

      const summaries = await summarize();

      expect(summaries.get('storage-1')).toEqual({ access: 'restricted', state: 'disabled' });
    });

    it.each([
      ['disabled', { enabled: false, validationState: 'rejected' as const }, [], 'disabled'],
      ['rejected', { validationState: 'rejected' as const }, [], 'reconnect-required'],
      ['missing a scope', { enabled: true }, [BIGQUERY_SCOPE, DRIVE_SCOPE], 'reauthorize-required'],
      ['holding every scope', { enabled: true }, [BIGQUERY_SCOPE], 'ready'],
      ['disabled while sign-in is not configured', { enabled: false }, null, 'disabled'],
      [
        'rejected while sign-in is not configured',
        { validationState: 'rejected' as const },
        null,
        'not-configured',
      ],
    ])(
      'derives the state of a Google account that is %s',
      async (_case, overrides, configuredScopes, state) => {
        const credential = await givenGoogleAccount();
        await bind(credential.id);
        await credentials.update({ id: credential.id }, overrides);

        const summaries = await summarize(configuredScopes);

        expect(summaries.get('storage-1')).toEqual(expect.objectContaining({ state }));
      }
    );

    it.each([
      [
        'ready when Google reports email and profile as userinfo URLs',
        'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/bigquery',
        'ready',
      ],
      [
        'reauthorize-required without the BigQuery scope',
        'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
        'reauthorize-required',
      ],
    ])('is %s', async (_case, grantedScope, state) => {
      const credential = await givenGoogleAccount({
        publicMetadata: {
          account: { email: 'ann@example.com', name: 'Ann', picture: null },
          scopes: grantedScope.split(' '),
        },
      });
      await bind(credential.id);

      const summaries = await summarize([BIGQUERY_SCOPE, 'openid', 'email', 'profile']);

      expect(summaries.get('storage-1')).toEqual(expect.objectContaining({ state }));
    });

    it('keeps a rejected key that is not OAuth ready, since only OAuth grants need reconnecting', async () => {
      const credential = await givenCredential({ validationState: 'rejected' });
      await bind(credential.id);

      const summaries = await summarize([BIGQUERY_SCOPE]);

      expect(summaries.get('storage-1')).toEqual(expect.objectContaining({ state: 'ready' }));
    });
  });

  describe('identitiesForStorages and findBoundStorageIds', () => {
    it('report only the active bindings of the project', async () => {
      const key = await givenCredential();
      const snowflake = await givenCredential({
        definitionId: 'snowflake-password',
        secret: { fields: { password: 'p' } },
        publicMetadata: { fields: { username: 'LOADER' } },
      });
      const databricks = await givenCredential({
        definitionId: 'databricks-token',
        secret: { fields: { token: 't' } },
        publicMetadata: null,
      });
      await bind(key.id);
      await bind(snowflake.id, {
        storageId: 'storage-2',
        type: DataStorageType.SNOWFLAKE,
      });
      await bind(databricks.id, {
        storageId: 'storage-3',
        type: DataStorageType.DATABRICKS,
      });
      await bind(key.id, { storageId: 'storage-4' });
      await storageCredentials.deactivateStorage('storage-4');
      const ids = ['storage-1', 'storage-2', 'storage-3', 'storage-4', 'storage-unbound'];

      expect(await storageCredentials.findBoundStorageIds('project-1', ids)).toEqual(
        new Set(['storage-1', 'storage-2', 'storage-3'])
      );
      expect(await storageCredentials.findBoundStorageIds('project-2', ids)).toEqual(new Set());
      expect(await storageCredentials.findBoundStorageIds('project-1', [])).toEqual(new Set());
      expect(await storageCredentials.identitiesForStorages('project-1', ids)).toEqual(
        new Map([
          ['storage-1', 'loader@warehouse.iam.gserviceaccount.com'],
          ['storage-2', 'LOADER'],
          ['storage-3', null],
        ])
      );
    });
  });

  describe('markStorageUsed', () => {
    it('records use on the storage binding', async () => {
      const credential = await givenCredential();
      await bind(credential.id);

      await storageCredentials.markStorageUsed('storage-1', credential.id);

      const [row] = await storageRows();
      expect(row.lastUsedAt).toBeInstanceOf(Date);
    });

    it('never throws', async () => {
      jest.spyOn(credentialService, 'markLastUsed').mockRejectedValue(new Error('db down'));

      await expect(
        storageCredentials.markStorageUsed('storage-1', 'credential-1')
      ).resolves.toBeUndefined();
    });
  });

  describe('moveStorageCredential', () => {
    const move = (storageId = 'storage-1') =>
      storageCredentials.moveStorageCredential({
        storageId,
        fromProjectId: 'project-1',
        toProjectId: 'project-2',
      });

    it('does nothing without a binding', async () => {
      const credential = await givenCredential();

      await move();

      expect(await credentials.countBy({ projectId: 'project-2' })).toBe(0);
      expect((await credentials.findOneByOrFail({ id: credential.id })).projectId).toBe(
        'project-1'
      );
    });

    it('moves the Credential and its binding when the Storage is the only binding, dropping Contexts and sharing', async () => {
      const context = await contexts.save(contexts.create({ name: 'Ads', projectId: 'project-1' }));
      const credential = await givenCredential({
        availableForUse: true,
        availableForMaintenance: true,
      });
      await dataSource
        .getRepository(CredentialContext)
        .save({ credentialId: credential.id, contextId: context.id });
      await bind(credential.id);
      const lock = jest.spyOn(credentialService, 'lockActiveByIdAndProjectId');

      await move();

      expect(lock).toHaveBeenCalledWith(credential.id, 'project-1');
      const moved = await credentialService.getByIdAndProjectId(credential.id, 'project-2');
      expect(moved).toMatchObject({ availableForUse: false, availableForMaintenance: false });
      expect(moved.contextIds).toEqual([]);
      expect(await storageRows()).toEqual([
        expect.objectContaining({
          projectId: 'project-2',
          credentialId: credential.id,
          active: true,
        }),
      ]);
    });

    it('binds the Storage to a Not shared copy when other Storages use the Credential', async () => {
      const context = await contexts.save(contexts.create({ name: 'Ads', projectId: 'project-1' }));
      const credential = await givenCredential({ availableForUse: true, enabled: true });
      await dataSource
        .getRepository(CredentialOwner)
        .save({ credentialId: credential.id, userId: 'member-1' });
      await dataSource
        .getRepository(CredentialContext)
        .save({ credentialId: credential.id, contextId: context.id });
      await bind(credential.id);
      await bind(credential.id, { storageId: 'storage-2' });

      await move();

      const [row] = await storageRows();
      expect(row.projectId).toBe('project-2');
      expect(row.credentialId).not.toBe(credential.id);
      const copy = await credentialService.getByIdAndProjectId(row.credentialId, 'project-2');
      expect(copy).toEqual(
        expect.objectContaining({
          title: 'Warehouse key',
          definitionId: 'google-service-account',
          secret: { value: 'service-account-key' },
          publicMetadata: credential.publicMetadata,
          availableForUse: false,
          availableForMaintenance: false,
          validationState: 'unknown',
          enabled: true,
        })
      );
      expect(copy.ownerIds).toEqual(['member-1']);
      expect(copy.contextIds).toEqual([]);
      const original = await credentialService.getByIdAndProjectId(credential.id, 'project-1');
      expect(original.contextIds).toEqual([context.id]);
      expect(await storageRows('storage-2')).toEqual([
        expect.objectContaining({ projectId: 'project-1', credentialId: credential.id }),
      ]);
    });
  });

  describe('moveStorageCredential into a project that already holds a copy', () => {
    const move = (storageId: string) =>
      storageCredentials.moveStorageCredential({
        storageId,
        fromProjectId: 'project-1',
        toProjectId: 'project-2',
      });

    async function givenCredentialOfThreeStorages(): Promise<Credential> {
      const credential = await givenCredential();
      await dataSource
        .getRepository(CredentialOwner)
        .save({ credentialId: credential.id, userId: 'member-1' });
      for (const storageId of ['storage-1', 'storage-2', 'storage-3']) {
        await bind(credential.id, { storageId });
      }
      return credential;
    }

    it('binds the next moved Storage to that copy instead of copying again', async () => {
      await givenCredentialOfThreeStorages();

      await move('storage-1');
      await move('storage-2');

      const [first] = await storageRows('storage-1');
      expect(await storageRows('storage-2')).toEqual([
        expect.objectContaining({ projectId: 'project-2', credentialId: first.credentialId }),
      ]);
      expect(await credentials.countBy({ projectId: 'project-2' })).toBe(1);
    });

    it('copies again when that copy has other owners', async () => {
      await givenCredentialOfThreeStorages();
      await move('storage-1');
      const [first] = await storageRows('storage-1');
      await dataSource
        .getRepository(CredentialOwner)
        .save({ credentialId: first.credentialId, userId: 'member-2' });

      await move('storage-2');

      const [second] = await storageRows('storage-2');
      expect(second.credentialId).not.toBe(first.credentialId);
      expect(await credentials.countBy({ projectId: 'project-2' })).toBe(2);
    });

    it('binds a sole remaining Storage to that copy and leaves the original unbound', async () => {
      const credential = await givenCredential();
      await bind(credential.id);
      await bind(credential.id, { storageId: 'storage-2' });
      await move('storage-1');
      const [first] = await storageRows('storage-1');

      await move('storage-2');

      expect(await storageRows('storage-2')).toEqual([
        expect.objectContaining({ projectId: 'project-2', credentialId: first.credentialId }),
      ]);
      expect(await credentials.countBy({ projectId: 'project-2' })).toBe(1);
      await expect(credentials.findOneByOrFail({ id: credential.id })).resolves.toMatchObject({
        projectId: 'project-1',
      });
      expect(await credentialService.countActiveBindings(credential.id)).toBe(0);
    });

    it('copies when that copy is deleted before the move can lock it', async () => {
      await givenCredentialOfThreeStorages();
      await move('storage-1');
      const [first] = await storageRows('storage-1');
      const lock = credentialService.lockActiveByIdAndProjectId.bind(credentialService);
      jest
        .spyOn(credentialService, 'lockActiveByIdAndProjectId')
        .mockImplementation(async (id, projectId) => {
          if (id === first.credentialId) await credentials.softDelete(id);
          return lock(id, projectId);
        });

      await move('storage-2');

      const [second] = await storageRows('storage-2');
      expect(second.credentialId).not.toBe(first.credentialId);
      await expect(credentials.findOneByOrFail({ id: second.credentialId })).resolves.toMatchObject(
        { projectId: 'project-2' }
      );
    });

    it('copies again when that copy holds the key with surrounding whitespace', async () => {
      await givenCredentialOfThreeStorages();
      await move('storage-1');
      const [first] = await storageRows('storage-1');
      await credentials.update(first.credentialId, { secret: { value: ' service-account-key ' } });

      await move('storage-2');

      const [second] = await storageRows('storage-2');
      expect(second.credentialId).not.toBe(first.credentialId);
      await expect(credentials.findOneByOrFail({ id: second.credentialId })).resolves.toMatchObject(
        { secret: { value: 'service-account-key' } }
      );
    });
  });

  describe('moveStorageCredential while the Storage is rebound', () => {
    it("leaves the member's binding and the Credential another Storage took meanwhile", async () => {
      const original = await givenCredential();
      const chosen = await givenGoogleAccount();
      await bind(original.id);
      const lock = credentialService.lockActiveByIdAndProjectId.bind(credentialService);
      // While the move waits for the lock, a member rebinds the Storage and another one binds it.
      jest
        .spyOn(credentialService, 'lockActiveByIdAndProjectId')
        .mockImplementationOnce(async (id, projectId) => {
          await bind(chosen.id);
          await bind(original.id, { storageId: 'storage-2' });
          return lock(id, projectId);
        });

      await storageCredentials.moveStorageCredential({
        storageId: 'storage-1',
        fromProjectId: 'project-1',
        toProjectId: 'project-2',
      });

      expect(await storageRows('storage-1')).toEqual([
        expect.objectContaining({ projectId: 'project-1', credentialId: chosen.id }),
      ]);
      expect(await storageRows('storage-2')).toEqual([
        expect.objectContaining({ projectId: 'project-1', credentialId: original.id }),
      ]);
      await expect(credentials.findOneByOrFail({ id: original.id })).resolves.toMatchObject({
        projectId: 'project-1',
      });
      expect(await credentials.countBy({ projectId: 'project-2' })).toBe(0);
    });
  });

  describe('moveStorageCredential with a disabled shared Credential', () => {
    it('keeps the copy disabled', async () => {
      const credential = await givenCredential();
      await bind(credential.id);
      await bind(credential.id, { storageId: 'storage-2' });
      await credentials.update(credential.id, { enabled: false });

      await storageCredentials.moveStorageCredential({
        storageId: 'storage-1',
        fromProjectId: 'project-1',
        toProjectId: 'project-2',
      });

      const [row] = await storageRows();
      expect((await credentials.findOneByOrFail({ id: row.credentialId })).enabled).toBe(false);
    });
  });

  describe('Credentials side of a Storage binding', () => {
    it('lists the Storage under usedBy', async () => {
      const credential = await givenCredential();
      await bind(credential.id);
      const view = new CredentialViewService(
        definitions,
        credentialService,
        new CredentialMapper({
          fetchUserProjectionsList: jest.fn().mockResolvedValue([]),
        } as never),
        access as never,
        {
          visibleTitles: jest
            .fn()
            .mockResolvedValue(new Map([['storage', new Map([['storage-1', 'Warehouse']])]])),
        } as never
      );

      const dto = await view.build(
        await credentialService.getByIdAndProjectId(credential.id, 'project-1'),
        { projectId: 'project-1', userId: 'member-1', roles: ['editor'] } as never
      );

      expect(dto.usedBy).toEqual([
        {
          consumerType: 'storage',
          consumerId: 'storage-1',
          title: 'Warehouse',
          requirementKey: 'storage',
          lastUsedAt: null,
        },
      ]);
    });

    it('refuses to delete a Credential bound to a Storage', async () => {
      const credential = await givenCredential();
      await bind(credential.id);
      const remove = new DeleteCredentialService(credentialService, access as never);

      await expect(
        remove.run(credential.id, {
          projectId: 'project-1',
          userId: 'member-1',
          roles: ['admin'],
        } as never)
      ).rejects.toBeInstanceOf(BusinessViolationException);
      await expect(
        credentialService.getByIdAndProjectId(credential.id, 'project-1')
      ).resolves.toBeDefined();
    });
  });
});
