import { BadRequestException, INestApplication } from '@nestjs/common';
import type { IdpProvider, Payload } from '@owox/idp-protocol';
import { AUTH_HEADER, closeTestApp, createTestApp, StorageBuilder } from '@owox/test-utils';
import * as crypto from 'crypto';
import * as supertest from 'supertest';
import { DataSource } from 'typeorm';
import { DataStorageType } from '../src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { DataStorageAccessValidatorFacade } from '../src/data-marts/data-storage-types/facades/data-storage-access-validator-facade.service';
import { ValidationResult } from '../src/data-marts/data-storage-types/interfaces/data-storage-access-validator.interface';
import { GoogleOAuthConfigService } from '../src/data-marts/services/google-oauth/google-oauth-config.service';
import { CredentialConsumerBinding } from '../src/data-marts/credentials/entities/credential-consumer-binding.entity';
import { PluginInstallation } from '../src/plugin-host/entities/plugin-installation.entity';
import { Plugin } from '../src/plugin-host/entities/plugin.entity';
import { PluginRuntimeAuthorizerService } from '../src/plugin-host/services/plugin-runtime-authorizer.service';
import { createCredential } from './fixtures/storage-credentials';

const OWNER_AUTH_HEADER = { 'x-owox-authorization': 'owner-token' };
const OTHER_AUTH_HEADER = { 'x-owox-authorization': 'other-token' };
const PLUGIN_AUTH_HEADER = { 'x-owox-authorization': 'plugin-token' };
const BIGQUERY_SCOPE = 'https://www.googleapis.com/auth/bigquery';

function payload(userId: string, roles: Payload['roles']): Payload {
  return { userId, email: `${userId}@localhost`, roles, fullName: userId, projectId: '0' };
}

function resolvePayload(token: string): Payload {
  if (token.startsWith('plugin')) {
    // A plugin acting for the admin, who can see every Credential.
    return {
      ...payload('0', ['admin']),
      authFlow: 'plugin',
      pluginId: 'plugin-1',
      installationId: 'installation-1',
    };
  }
  if (token.startsWith('owner')) return payload('1', ['editor']);
  if (token.startsWith('other')) return payload('3', ['editor']);
  return payload('0', ['admin']);
}

function serviceAccountKey(email: string): string {
  return JSON.stringify({
    type: 'service_account',
    project_id: 'warehouse-1',
    private_key_id: 'key-1',
    private_key: 'not-a-real-key',
    client_email: email,
  });
}

describe('Binding a Credential to a Storage (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let dataSource: DataSource;
  let verifyAccess: jest.SpyInstance;
  let ownerKeyId: string;
  let adminKeyId: string;
  const config = { projectId: 'warehouse-1', location: 'US' };

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;
    dataSource = app.get(DataSource);

    const expressApp = app.getHttpAdapter().getInstance() as { get(name: string): unknown };
    const idpProvider = expressApp.get('idp') as IdpProvider;
    jest.spyOn(idpProvider, 'introspectToken').mockImplementation(async t => resolvePayload(t));
    jest.spyOn(idpProvider, 'parseToken').mockImplementation(async t => resolvePayload(t));

    const oauthConfig = app.get(GoogleOAuthConfigService);
    jest.spyOn(oauthConfig, 'isStorageConfigured').mockReturnValue(true);
    jest
      .spyOn(oauthConfig, 'getBigQueryScopes')
      .mockReturnValue([BIGQUERY_SCOPE, 'openid', 'email', 'profile']);
    jest
      .spyOn(oauthConfig, 'getClientById')
      .mockReturnValue({ clientId: 'storage-client', clientSecret: 'client-secret' });
    verifyAccess = jest.spyOn(app.get(DataStorageAccessValidatorFacade), 'verifyAccess');
    jest
      .spyOn(app.get(PluginRuntimeAuthorizerService), 'assertActiveInstallation')
      .mockResolvedValue(undefined);

    ownerKeyId = await givenServiceAccount('Owner key', '1');
    adminKeyId = await givenServiceAccount('Admin key', '0');
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(() => verifyAccess.mockReset().mockResolvedValue(undefined));

  function givenServiceAccount(title: string, ownerId: string): Promise<string> {
    return createCredential(app, {
      projectId: '0',
      definitionId: 'google-service-account',
      title,
      secret: { value: serviceAccountKey(`${ownerId}@warehouse-1.iam.gserviceaccount.com`) },
      publicMetadata: {
        clientEmail: `${ownerId}@warehouse-1.iam.gserviceaccount.com`,
        projectId: 'warehouse-1',
        privateKeyId: 'key-1',
      },
      ownerIds: [ownerId],
      contextIds: [],
    });
  }

  /** A BigQuery Storage Shared for maintenance: every Technical User can edit it. */
  async function givenStorage(): Promise<string> {
    const storage = await agent
      .post('/api/data-storages')
      .set(AUTH_HEADER)
      .send(new StorageBuilder().withType(DataStorageType.GOOGLE_BIGQUERY).build())
      .expect(201);
    await agent
      .put(`/api/data-storages/${storage.body.id}/availability`)
      .set(AUTH_HEADER)
      .send({ availableForUse: true, availableForMaintenance: true })
      .expect(204);
    return storage.body.id;
  }

  /** A Storage the admin bound to the Credential with `config`; the setup's check is forgotten. */
  async function givenBoundStorage(credentialId: string): Promise<string> {
    const storageId = await givenStorage();
    await put(storageId, AUTH_HEADER, { reusableCredentialId: credentialId }).expect(200);
    verifyAccess.mockClear();
    return storageId;
  }

  async function boundCredentialId(storageId: string): Promise<string | null> {
    const [row] = (await dataSource.query(
      "SELECT credentialId FROM credential_consumer_binding WHERE consumerType = 'storage' AND consumerId = ? AND active = 1",
      [storageId]
    )) as Array<{ credentialId: string }>;
    return row?.credentialId ?? null;
  }

  async function storedConfig(storageId: string): Promise<unknown> {
    const [row] = (await dataSource.query('SELECT config FROM data_storage WHERE id = ?', [
      storageId,
    ])) as Array<{ config: string }>;
    return JSON.parse(row.config);
  }

  function put(storageId: string, headers: Record<string, string>, body: Record<string, unknown>) {
    return agent
      .put(`/api/data-storages/${storageId}`)
      .set(headers)
      .send({ title: 'Warehouse', config, ...body });
  }

  it("refuses another member's Not shared Credential", async () => {
    const storageId = await givenStorage();

    const res = await put(storageId, OTHER_AUTH_HEADER, { reusableCredentialId: ownerKeyId });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('You cannot use this Credential.');
    expect(verifyAccess).not.toHaveBeenCalled();
    expect(await boundCredentialId(storageId)).toBeNull();
  });

  it('lets the owner bind their Credential and see it', async () => {
    const storageId = await givenStorage();

    const res = await put(storageId, OWNER_AUTH_HEADER, { reusableCredentialId: ownerKeyId });

    expect(res.status).toBe(200);
    expect(res.body.reusableCredential).toMatchObject({ access: 'visible', id: ownerKeyId });
    expect(await boundCredentialId(storageId)).toBe(ownerKeyId);
  });

  /** An old key row as the previous release wrote it, set on the Storage. */
  async function givenOldKeyRow(storageId: string): Promise<void> {
    const rowId = crypto.randomUUID();
    await dataSource.query(
      `INSERT INTO data_storage_credentials (id, projectId, type, credentials, createdAt, modifiedAt)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        rowId,
        '0',
        'google_service_account',
        serviceAccountKey('legacy@warehouse-1.iam.gserviceaccount.com'),
      ]
    );
    await dataSource.query('UPDATE data_storage SET credentialId = ? WHERE id = ?', [
      rowId,
      storageId,
    ]);
  }

  const pending = { access: 'pending', state: 'ready' };

  it('hides the bound Credential from a plugin on a get and on a save that keeps it', async () => {
    const storageId = await givenBoundStorage(adminKeyId);

    const got = await agent
      .get(`/api/data-storages/${storageId}`)
      .set(PLUGIN_AUTH_HEADER)
      .expect(200);
    const saved = await put(storageId, PLUGIN_AUTH_HEADER, {}).expect(200);

    for (const body of [got.body, saved.body]) {
      expect(body.reusableCredential).toEqual({ access: 'restricted', state: 'ready' });
    }
    await expect(boundCredentialId(storageId)).resolves.toBe(adminKeyId);
  });

  it('says an unconverted Storage runs on its own key and keeps it on a config-only save', async () => {
    const unconvertedId = await givenStorage();
    const keylessId = await givenStorage();
    await givenOldKeyRow(unconvertedId);

    const one = await agent.get(`/api/data-storages/${unconvertedId}`).set(AUTH_HEADER).expect(200);
    const list = await agent.get('/api/data-storages').set(AUTH_HEADER).expect(200);
    const saved = await put(unconvertedId, AUTH_HEADER, { title: 'Renamed' });

    expect(one.body.reusableCredential).toEqual(pending);
    const listed = new Map(
      (list.body as Array<{ id: string; reusableCredential: unknown }>).map(storage => [
        storage.id,
        storage.reusableCredential,
      ])
    );
    expect(listed.get(unconvertedId)).toEqual(pending);
    expect(listed.get(keylessId)).toBeNull();
    expect(saved.status).toBe(200);
    expect(saved.body.reusableCredential).toEqual(pending);
    expect(await boundCredentialId(unconvertedId)).toBeNull();
    expect(verifyAccess).not.toHaveBeenCalled();
  });

  it('says a Storage bound only in another project still runs on its own key', async () => {
    const storageId = await givenStorage();
    await givenOldKeyRow(storageId);
    await dataSource.getRepository(CredentialConsumerBinding).insert({
      projectId: 'other-project',
      credentialId: adminKeyId,
      consumerType: 'storage',
      consumerId: storageId,
      requirementKey: 'storage',
      requirementSnapshot: { definitionIds: ['google-service-account'], scopes: [] },
      requirementRevision: 'revision-1',
      configuredById: null,
    });

    const one = await agent.get(`/api/data-storages/${storageId}`).set(AUTH_HEADER).expect(200);
    const list = await agent.get('/api/data-storages').set(AUTH_HEADER).expect(200);

    expect(one.body.reusableCredential).toEqual(pending);
    expect(
      (list.body as Array<{ id: string; reusableCredential: unknown }>).find(
        storage => storage.id === storageId
      )?.reusableCredential
    ).toEqual(pending);
  });

  it('keeps the previous binding when verifyAccess rejects the selected Credential', async () => {
    const storageId = await givenBoundStorage(ownerKeyId);
    verifyAccess.mockRejectedValue(new BadRequestException('Access denied'));

    const res = await put(storageId, AUTH_HEADER, {
      reusableCredentialId: adminKeyId,
      config: { projectId: 'other-warehouse-1', location: 'US' },
    });

    expect(res.status).toBe(400);
    expect(await boundCredentialId(storageId)).toBe(ownerKeyId);
    expect(await storedConfig(storageId)).toEqual(config);
  });

  it('keeps a lost grant found during the bind marked rejected after the 400', async () => {
    const storageId = await givenBoundStorage(ownerKeyId);
    // An expired grant without a refresh token: the first use finds it lost.
    const expiredGoogleId = await createCredential(app, {
      projectId: '0',
      definitionId: 'google-oauth',
      title: 'Expired grant',
      secret: {
        oauth: {
          provider: 'google',
          clientId: 'storage-client',
          tokens: {
            access_token: 'expired',
            token_type: 'Bearer',
            scope: BIGQUERY_SCOPE,
            expiry_date: 1,
          },
        },
      },
      publicMetadata: {
        account: { email: 'ann@example.com', name: null, picture: null },
        scopes: [BIGQUERY_SCOPE],
      },
      ownerIds: ['0'],
      contextIds: [],
    });

    const res = await put(storageId, AUTH_HEADER, { reusableCredentialId: expiredGoogleId });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('STORAGE_CREDENTIAL_UNAVAILABLE');
    const [credential] = (await dataSource.query(
      'SELECT validationState FROM credential WHERE id = ?',
      [expiredGoogleId]
    )) as Array<{ validationState: string }>;
    expect(credential.validationState).toBe('rejected');
    expect(await boundCredentialId(storageId)).toBe(ownerKeyId);
  });

  it('saves an unchanged config without an access check', async () => {
    const storageId = await givenBoundStorage(ownerKeyId);

    const res = await put(storageId, OTHER_AUTH_HEADER, { title: 'Renamed warehouse' });

    expect(res.status).toBe(200);
    expect(verifyAccess).not.toHaveBeenCalled();
  });

  it('saves a config sent back in another form without an access check', async () => {
    const storageId = await givenBoundStorage(ownerKeyId);

    const res = await put(storageId, OTHER_AUTH_HEADER, {
      config: { location: 'US', projectId: 'warehouse-1', note: 'ignored' },
    });

    expect(res.status).toBe(200);
    expect(verifyAccess).not.toHaveBeenCalled();
    expect(await storedConfig(storageId)).toEqual(config);
  });

  it('lets a member without USE change a setting that keeps the connection target', async () => {
    const storageId = await givenBoundStorage(ownerKeyId);

    const res = await put(storageId, OTHER_AUTH_HEADER, { config: { ...config, location: 'EU' } });

    expect(res.status).toBe(200);
    expect(verifyAccess).toHaveBeenCalledTimes(1);
    expect(await storedConfig(storageId)).toEqual({ ...config, location: 'EU' });
  });

  it('refuses a member without USE a change of the connection target', async () => {
    const storageId = await givenBoundStorage(ownerKeyId);

    const res = await put(storageId, OTHER_AUTH_HEADER, {
      config: { projectId: 'other-warehouse-1', location: 'EU' },
    });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('You cannot use this Credential.');
    expect(verifyAccess).not.toHaveBeenCalled();
    expect(await storedConfig(storageId)).toEqual(config);
  });

  it('saves a config change unchecked while the bound Credential is disabled', async () => {
    const disabledKeyId = await givenServiceAccount('Disabled key', '0');
    const storageId = await givenBoundStorage(disabledKeyId);
    await dataSource.query('UPDATE credential SET enabled = 0 WHERE id = ?', [disabledKeyId]);

    const res = await put(storageId, OTHER_AUTH_HEADER, { config: { ...config, location: 'EU' } });

    expect(res.status).toBe(200);
    expect(res.body.reusableCredential).toMatchObject({ state: 'disabled' });
    expect(verifyAccess).not.toHaveBeenCalled();
    expect(await storedConfig(storageId)).toEqual({ ...config, location: 'EU' });
  });

  it('still rejects a malformed config while the bound Credential is disabled', async () => {
    const storage = await agent
      .post('/api/data-storages')
      .set(AUTH_HEADER)
      .send(new StorageBuilder().withType(DataStorageType.DATABRICKS).build())
      .expect(201);
    const tokenId = await createCredential(app, {
      projectId: '0',
      definitionId: 'databricks-token',
      title: 'Databricks token',
      secret: { fields: { token: 'dapi-token' } },
      publicMetadata: null,
      ownerIds: ['0'],
      contextIds: [],
    });
    const databricksConfig = { host: 'workspace.cloud.databricks.com', httpPath: '/sql/1' };
    await put(storage.body.id, AUTH_HEADER, {
      config: databricksConfig,
      reusableCredentialId: tokenId,
    }).expect(200);
    await dataSource.query('UPDATE credential SET enabled = 0 WHERE id = ?', [tokenId]);
    verifyAccess.mockClear();

    const res = await put(storage.body.id, AUTH_HEADER, {
      config: { ...databricksConfig, httpPath: '' },
    });

    expect(res.status).toBe(400);
    expect(res.body.errorDetails.fieldErrors).toEqual([
      expect.objectContaining({ field: 'config.httpPath' }),
    ]);
    expect(verifyAccess).not.toHaveBeenCalled();
    expect(await storedConfig(storage.body.id)).toEqual(databricksConfig);
  });

  describe('replacing the values of a bound AWS access key', () => {
    const athenaConfig = { region: 'us-east-1', outputBucket: 's3://results' };
    let athenaId: string;
    let awsKeyId: string;
    let validateAccess: jest.SpyInstance;

    beforeAll(() => {
      validateAccess = jest.spyOn(app.get(DataStorageAccessValidatorFacade), 'validateAccess');
    });

    afterAll(() => validateAccess.mockRestore());

    beforeEach(async () => {
      const storage = await agent
        .post('/api/data-storages')
        .set(AUTH_HEADER)
        .send(new StorageBuilder().withType(DataStorageType.AWS_ATHENA).build())
        .expect(201);
      athenaId = storage.body.id;
      // Not shared: only its owner and admins can see it.
      await agent
        .put(`/api/data-storages/${athenaId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: false, availableForMaintenance: false })
        .expect(204);
      awsKeyId = await createCredential(app, {
        projectId: '0',
        definitionId: 'aws-access-key',
        title: 'AWS key',
        secret: { fields: { secretAccessKey: 'old-secret-access-key' } },
        publicMetadata: { fields: { accessKeyId: 'key-id-1' } },
        ownerIds: ['0'],
        contextIds: [],
      });
      // Every Technical User may maintain the key.
      await agent
        .put(`/api/credentials/${awsKeyId}`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: true })
        .expect(200);
      await agent
        .put(`/api/data-storages/${athenaId}`)
        .set(AUTH_HEADER)
        .send({ title: 'Athena prod', config: athenaConfig, reusableCredentialId: awsKeyId })
        .expect(200);
    });

    afterEach(() => validateAccess.mockReset());

    async function storedKey(): Promise<{ secretAccessKey: string; validationState: string }> {
      const [row] = (await dataSource.query(
        'SELECT secret, validationState FROM credential WHERE id = ?',
        [awsKeyId]
      )) as Array<{ secret: string; validationState: string }>;
      const secret = JSON.parse(row.secret) as { fields: { secretAccessKey: string } };
      return {
        secretAccessKey: secret.fields.secretAccessKey,
        validationState: row.validationState,
      };
    }

    function replaceSecret(headers: Record<string, string>, secretAccessKey: string) {
      return agent
        .put(`/api/credentials/${awsKeyId}`)
        .set(headers)
        .send({ fields: { secretAccessKey } });
    }

    /** The Storage works with the stored secret and rejects every other one. */
    function acceptOnlyStoredSecret(failure: ValidationResult) {
      validateAccess.mockImplementation(
        async (_type: unknown, _config: unknown, credentials: { secretAccessKey?: string }) =>
          credentials.secretAccessKey === 'old-secret-access-key'
            ? ValidationResult.success()
            : failure
      );
    }

    it('saves nothing when the bound Storage rejects the new secret', async () => {
      acceptOnlyStoredSecret(
        ValidationResult.failure('Access validation failed', {
          error: 'The security token included in the request is invalid.',
        })
      );

      const res = await replaceSecret(AUTH_HEADER, 'typo-secret-access-key');

      expect(res.status).toBe(400);
      expect(res.body.message).toBe(
        'The new values do not work for Storage "Athena prod": Access validation failed'
      );
      expect(res.body.errorDetails).toEqual({
        error: 'The security token included in the request is invalid.',
      });
      expect(JSON.stringify(res.body)).not.toContain('typo-secret-access-key');
      expect(await storedKey()).toEqual({
        secretAccessKey: 'old-secret-access-key',
        validationState: 'unknown',
      });
    });

    it('does not name the Storage to a maintainer who cannot see it', async () => {
      acceptOnlyStoredSecret(ValidationResult.failure('Access validation failed'));

      const res = await replaceSecret(OTHER_AUTH_HEADER, 'typo-secret-access-key');

      expect(res.status).toBe(400);
      expect(res.body.message).toBe(
        'The new values do not work for a Storage that uses this Credential: Access validation failed'
      );
      expect(await storedKey()).toMatchObject({ secretAccessKey: 'old-secret-access-key' });
    });

    it('saves the new secret when the bound Storage rejects the stored one too', async () => {
      validateAccess.mockResolvedValue(ValidationResult.failure('Cluster paused'));

      const res = await replaceSecret(AUTH_HEADER, 'new-secret-access-key');

      expect(res.status).toBe(200);
      expect(await storedKey()).toMatchObject({ secretAccessKey: 'new-secret-access-key' });
    });

    it('saves the new secret as verified when the bound Storage accepts it', async () => {
      validateAccess.mockResolvedValue(ValidationResult.success());

      const res = await replaceSecret(OTHER_AUTH_HEADER, 'new-secret-access-key');

      expect(res.status).toBe(200);
      expect(res.body.validationState).toBe('verified');
      expect(validateAccess).toHaveBeenCalledWith(DataStorageType.AWS_ATHENA, athenaConfig, {
        accessKeyId: 'key-id-1',
        secretAccessKey: 'new-secret-access-key',
      });
      expect(await storedKey()).toEqual({
        secretAccessKey: 'new-secret-access-key',
        validationState: 'verified',
      });
    });

    it('checks and saves a session token added to the key', async () => {
      validateAccess.mockResolvedValue(ValidationResult.success());

      const res = await agent
        .put(`/api/credentials/${awsKeyId}`)
        .set(AUTH_HEADER)
        .send({ fields: { sessionToken: 'session-token-1' } });

      expect(res.status).toBe(200);
      expect(res.body.validationState).toBe('verified');
      expect(res.body.setSecretFieldKeys).toEqual(['secretAccessKey', 'sessionToken']);
      expect(JSON.stringify(res.body)).not.toContain('session-token-1');
      expect(validateAccess).toHaveBeenCalledWith(DataStorageType.AWS_ATHENA, athenaConfig, {
        accessKeyId: 'key-id-1',
        secretAccessKey: 'old-secret-access-key',
        sessionToken: 'session-token-1',
      });
      const [row] = (await dataSource.query('SELECT secret FROM credential WHERE id = ?', [
        awsKeyId,
      ])) as Array<{ secret: string }>;
      expect(JSON.parse(row.secret)).toEqual({
        fields: { secretAccessKey: 'old-secret-access-key', sessionToken: 'session-token-1' },
      });
    });

    it('titles the Storage under usedBy only for members who can see it', async () => {
      const admin = await agent.get(`/api/credentials/${awsKeyId}`).set(AUTH_HEADER).expect(200);
      const other = await agent.get('/api/credentials').set(OTHER_AUTH_HEADER).expect(200);
      const listed = (other.body as Array<{ id: string; usedBy: unknown[] }>).find(
        credential => credential.id === awsKeyId
      );

      expect(admin.body.usedBy).toEqual([
        expect.objectContaining({ consumerId: athenaId, title: 'Athena prod' }),
      ]);
      expect(admin.body.setSecretFieldKeys).toEqual(['secretAccessKey']);
      expect(listed?.usedBy).toEqual([
        expect.objectContaining({ consumerId: athenaId, title: null }),
      ]);
      expect(JSON.stringify([admin.body, listed])).not.toContain('old-secret-access-key');
    });

    it('titles a plugin installation under usedBy for its member and admins only', async () => {
      const plugin = await dataSource.getRepository(Plugin).save({
        githubRepoId: '7130',
        repoOwner: 'owox',
        repoName: 'slack-digest',
        repoHtmlUrl: 'https://github.com/owox/slack-digest',
      });
      const installation = await dataSource
        .getRepository(PluginInstallation)
        .save({ pluginId: plugin.id, projectId: '0', userId: '1', installedAt: new Date() });
      const requirement = { key: 'aws', definitionId: 'aws-access-key', optional: false };
      await dataSource.getRepository(CredentialConsumerBinding).insert({
        projectId: '0',
        credentialId: awsKeyId,
        consumerType: 'plugin-installation',
        consumerId: installation.id,
        requirementKey: 'aws',
        requirementSnapshot: requirement,
        requirementRevision: 'revision-1',
        configuredById: '1',
      });

      async function installationTitle(headers: Record<string, string>) {
        const res = await agent.get('/api/credentials').set(headers).expect(200);
        const credential = (
          res.body as Array<{ id: string; usedBy: Array<{ consumerId: string; title: unknown }> }>
        ).find(item => item.id === awsKeyId);
        return credential?.usedBy.find(consumer => consumer.consumerId === installation.id)?.title;
      }

      expect(await installationTitle(AUTH_HEADER)).toBe('slack-digest');
      expect(await installationTitle(OWNER_AUTH_HEADER)).toBe('slack-digest');
      expect(await installationTitle(OTHER_AUTH_HEADER)).toBeNull();
    });
  });
});
