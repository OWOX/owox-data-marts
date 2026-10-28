import { INestApplication } from '@nestjs/common';
import { closeTestApp, createTestApp } from '@owox/test-utils';
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { CustomLoggerService } from '../src/common/logger/logger.service';
import { Credential } from '../src/data-marts/credentials/entities/credential.entity';
import { requirementRevision } from '../src/data-marts/credentials/services/credential-requirement-revision';
import { DataStorageType } from '../src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { StorageCredentialBindingService } from '../src/data-marts/data-storage-types/storage-credential-binding.service';
import {
  STORAGES_ON_OLD_KEY_SQL,
  UNCONVERTED_STORAGES_SQL,
} from '../src/data-marts/services/storage-credential-conversion/legacy-storage-credential-sql';
import { ConvertStorageCredentials1792600000000 } from '../src/migrations/1792600000000-convert-storage-credentials';
import { GOOGLE_OAUTH_ENV } from './fixtures/google-oauth';
import { bindStorageCredential, createCredential } from './fixtures/storage-credentials';

const PROJECT = 'project-1';
const BIGQUERY_SCOPE = 'https://www.googleapis.com/auth/bigquery';

interface StorageSeed {
  keyType?: string;
  key: Record<string, unknown>;
  identity?: Record<string, unknown>;
  type?: DataStorageType;
  owners?: string[];
  contexts?: string[];
  availableForUse?: boolean;
  availableForMaintenance?: boolean;
}

function awsKey(secretAccessKey: string, accessKeyId = 'AKIA1'): StorageSeed {
  return { key: { accessKeyId, secretAccessKey }, identity: { accessKeyId } };
}

describe('Storage key conversion migration (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const contexts: string[] = [];

  beforeAll(async () => {
    app = (await createTestApp()).app;
    dataSource = app.get(DataSource);
    for (const name of ['c1', 'c2', 'c3']) {
      const id = crypto.randomUUID();
      await dataSource.query(
        `INSERT INTO context (id, name, projectId, createdAt, modifiedAt)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [id, name, PROJECT]
      );
      contexts.push(id);
    }
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const key of Object.keys(GOOGLE_OAUTH_ENV)) delete process.env[key];
  });

  /** A Storage on an old key row, seeded by SQL as release N-1 wrote it. */
  async function givenStorage(seed: StorageSeed): Promise<string> {
    const rowId = crypto.randomUUID();
    await dataSource.query(
      `INSERT INTO data_storage_credentials (id, projectId, type, credentials, identity, createdAt, modifiedAt)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        rowId,
        PROJECT,
        seed.keyType ?? 'aws_iam',
        JSON.stringify(seed.key),
        seed.identity ? JSON.stringify(seed.identity) : null,
      ]
    );
    const storageId = crypto.randomUUID();
    await dataSource.query(
      `INSERT INTO data_storage (id, type, projectId, title, config, credentialId,
         availableForUse, availableForMaintenance, createdAt, modifiedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        storageId,
        seed.type ?? DataStorageType.AWS_ATHENA,
        PROJECT,
        'Warehouse',
        JSON.stringify({}),
        rowId,
        (seed.availableForUse ?? true) ? 1 : 0,
        seed.availableForMaintenance ? 1 : 0,
      ]
    );
    for (const userId of seed.owners ?? ['editor-1']) {
      await dataSource.query('INSERT INTO storage_owners (storage_id, user_id) VALUES (?, ?)', [
        storageId,
        userId,
      ]);
    }
    for (const contextId of seed.contexts ?? []) {
      await dataSource.query(
        'INSERT INTO storage_contexts (storage_id, context_id) VALUES (?, ?)',
        [storageId, contextId]
      );
    }
    return storageId;
  }

  async function convert(): Promise<void> {
    const queryRunner = dataSource.createQueryRunner();
    try {
      await new ConvertStorageCredentials1792600000000().up(queryRunner);
    } finally {
      await queryRunner.release();
    }
  }

  function rows(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
    return dataSource.query(sql, params);
  }

  function bindingsOf(storageId: string): Promise<Record<string, unknown>[]> {
    return rows('SELECT * FROM credential_consumer_binding WHERE consumerId = ?', [storageId]);
  }

  async function listedBy(sql: string, storageId: string): Promise<boolean> {
    return (await rows(sql)).some(row => row.id === storageId);
  }

  it('converts identical keys into one Not shared Credential with all owners and shared Contexts', async () => {
    const [c1, c2, c3] = contexts;
    const shared = await givenStorage({
      ...awsKey('secret'),
      owners: ['editor-1', 'viewer-1'],
      contexts: [c1, c2],
      availableForUse: true,
      availableForMaintenance: true,
    });
    const maintained = await givenStorage({
      ...awsKey('secret'),
      owners: ['viewer-1', 'editor-1'],
      contexts: [c2, c3],
      availableForUse: true,
      availableForMaintenance: true,
    });

    await convert();

    const [binding] = await bindingsOf(shared);
    expect(await bindingsOf(maintained)).toEqual([
      expect.objectContaining({ credentialId: binding.credentialId }),
    ]);
    const snapshot = { definitionIds: ['aws-access-key'], scopes: [] };
    expect(binding).toMatchObject({
      projectId: PROJECT,
      consumerType: 'storage',
      requirementKey: 'storage',
      requirementRevision: requirementRevision(snapshot),
      configuredById: null,
      active: 1,
    });
    expect(JSON.parse(binding.requirementSnapshot as string)).toEqual(snapshot);
    const [credential] = await rows('SELECT * FROM credential WHERE id = ?', [
      binding.credentialId,
    ]);
    expect(credential).toMatchObject({
      projectId: PROJECT,
      title: 'AKIA1',
      definitionSource: 'builtin',
      definitionId: 'aws-access-key',
      acceptedCompatibilityLine: null,
      enabled: 1,
      // Not shared, although both Storages were: Credential sharing ignores roles.
      availableForUse: 0,
      availableForMaintenance: 0,
      validationState: 'unknown',
      createdById: null,
      deletedAt: null,
    });
    expect(credential.createdAt).toBeTruthy();
    const owners = await rows(
      'SELECT user_id FROM credential_owners WHERE credential_id = ? ORDER BY user_id',
      [binding.credentialId]
    );
    expect(owners.map(row => row.user_id)).toEqual(['editor-1', 'viewer-1']);
    expect(
      await rows('SELECT context_id FROM credential_contexts WHERE credential_id = ?', [
        binding.credentialId,
      ])
    ).toEqual([{ context_id: c2 }]);
    // The app reads what the migration wrote.
    await expect(
      app
        .get(StorageCredentialBindingService)
        .resolveForStorage({ id: shared, projectId: PROJECT, type: DataStorageType.AWS_ATHENA })
    ).resolves.toMatchObject({
      credentialId: binding.credentialId,
      secret: { fields: { secretAccessKey: 'secret' } },
      publicMetadata: { fields: { accessKeyId: 'AKIA1' } },
    });
    expect(await listedBy(STORAGES_ON_OLD_KEY_SQL, shared)).toBe(false);
  });

  it('leaves a bound Storage alone and lists one bound in another project for removal', async () => {
    const chosenId = await createCredential(app, {
      projectId: PROJECT,
      definitionId: 'aws-access-key',
      title: 'Chosen',
      secret: { fields: { secretAccessKey: 'chosen' } },
      publicMetadata: { fields: { accessKeyId: 'AKIA3' } },
      ownerIds: ['editor-1'],
      contextIds: [],
    });
    const bound = await givenStorage(awsKey('bound', 'AKIA2'));
    await bindStorageCredential(app, {
      projectId: PROJECT,
      storageId: bound,
      type: DataStorageType.AWS_ATHENA,
      credentialId: chosenId,
    });
    // A move by release N-1 after the migration leaves the binding in the old project.
    const movedAway = await givenStorage(awsKey('moved', 'AKIA4'));
    await bindStorageCredential(app, {
      projectId: 'project-2',
      storageId: movedAway,
      type: DataStorageType.AWS_ATHENA,
      credentialId: chosenId,
    });

    await convert();

    expect(await bindingsOf(bound)).toEqual([
      expect.objectContaining({ projectId: PROJECT, credentialId: chosenId, active: 1 }),
    ]);
    expect(await bindingsOf(movedAway)).toEqual([
      expect.objectContaining({ projectId: 'project-2', credentialId: chosenId, active: 1 }),
    ]);
    expect(await listedBy(UNCONVERTED_STORAGES_SQL, movedAway)).toBe(false);
    expect(await listedBy(STORAGES_ON_OLD_KEY_SQL, movedAway)).toBe(true);
    expect(await listedBy(STORAGES_ON_OLD_KEY_SQL, bound)).toBe(false);
  });

  it('keeps a row it cannot convert on its old key and logs why', async () => {
    const warn = jest.spyOn(CustomLoggerService.prototype, 'warn');
    const unknown = await givenStorage({ keyType: 'kerberos', key: { ticket: 'ticket' } });

    await convert();

    expect(warn).toHaveBeenCalledWith(`Storage ${unknown} keeps its old key: unknown key type`);
    expect(await bindingsOf(unknown)).toEqual([]);
    expect(await listedBy(STORAGES_ON_OLD_KEY_SQL, unknown)).toBe(true);
  });

  it('converts a Google OAuth row with the configured client and the picked token fields', async () => {
    Object.assign(process.env, GOOGLE_OAUTH_ENV);
    const tokens = {
      access_token: 'access-1',
      refresh_token: 'refresh-1',
      token_type: 'Bearer',
      scope: `${BIGQUERY_SCOPE} openid`,
      expiry_date: 1000,
    };
    const storageId = await givenStorage({
      keyType: 'google_oauth',
      key: { ...tokens, id_token: 'id-token-1' },
      identity: { email: 'ann@example.com', name: 'Ann', picture: 'p.png' },
      type: DataStorageType.GOOGLE_BIGQUERY,
    });

    await convert();

    const [binding] = await bindingsOf(storageId);
    expect(JSON.parse(binding.requirementSnapshot as string)).toEqual({
      definitionIds: ['google-service-account', 'google-oauth'],
      scopes: [BIGQUERY_SCOPE],
    });
    const credential = await dataSource
      .getRepository(Credential)
      .findOneByOrFail({ id: binding.credentialId as string });
    expect(credential).toMatchObject({
      definitionId: 'google-oauth',
      title: 'ann@example.com',
    });
    expect(credential.secret).toEqual({
      oauth: {
        provider: 'google',
        clientId: GOOGLE_OAUTH_ENV.OAUTH_GOOGLE_STORAGE_CLIENT_ID,
        tokens,
      },
    });
    expect(credential.publicMetadata).toEqual({
      account: { email: 'ann@example.com', name: 'Ann', picture: 'p.png' },
      scopes: [BIGQUERY_SCOPE, 'openid'],
    });
  });

  it('keeps a Google OAuth row on its old key while OAUTH_GOOGLE_STORAGE_CLIENT_ID is unset', async () => {
    delete process.env.OAUTH_GOOGLE_STORAGE_CLIENT_ID;
    const warn = jest.spyOn(CustomLoggerService.prototype, 'warn');
    const storageId = await givenStorage({
      keyType: 'google_oauth',
      key: { access_token: 'access-1', refresh_token: 'refresh-1', token_type: 'Bearer' },
      type: DataStorageType.GOOGLE_BIGQUERY,
    });

    await convert();

    expect(warn).toHaveBeenCalledWith(
      `Storage ${storageId} keeps its old key: Google sign-in is not configured`
    );
    expect(await bindingsOf(storageId)).toEqual([]);
  });

  it('copies only the Contexts of the Storage project that are not deleted', async () => {
    const insertContext = async (projectId: string, deleted: boolean) => {
      const id = crypto.randomUUID();
      await dataSource.query(
        `INSERT INTO context (id, name, projectId, createdAt, modifiedAt, deletedAt)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)`,
        [id, `context ${id}`, projectId, deleted ? new Date().toISOString() : null]
      );
      return id;
    };
    const foreign = await insertContext('project-2', false);
    const deleted = await insertContext(PROJECT, true);
    const storageId = await givenStorage({
      ...awsKey('contexts', 'AKIA8'),
      contexts: [contexts[0], foreign, deleted],
    });

    await convert();

    const [binding] = await bindingsOf(storageId);
    expect(
      await rows('SELECT context_id FROM credential_contexts WHERE credential_id = ?', [
        binding.credentialId,
      ])
    ).toEqual([{ context_id: contexts[0] }]);
  });

  it('rolls back every conversion write when one write fails', async () => {
    const first = await givenStorage(awsKey('rollback-1', 'AKIA6'));
    const second = await givenStorage(awsKey('rollback-2', 'AKIA7'));
    const counts = () =>
      Promise.all(
        [
          'credential',
          'credential_owners',
          'credential_contexts',
          'credential_consumer_binding',
        ].map(table => rows(`SELECT COUNT(*) AS n FROM ${table}`))
      );
    const before = await counts();
    const queryRunner = dataSource.createQueryRunner();
    const query = queryRunner.query.bind(queryRunner);
    let bindings = 0;
    jest.spyOn(queryRunner, 'query').mockImplementation((async (
      sql: string,
      params?: unknown[]
    ) => {
      if (
        sql.trimStart().startsWith('INSERT INTO credential_consumer_binding') &&
        ++bindings === 2
      ) {
        throw new Error('disk full');
      }
      return query(sql, params);
    }) as never);

    await queryRunner.startTransaction();
    try {
      await expect(new ConvertStorageCredentials1792600000000().up(queryRunner)).rejects.toThrow(
        'Storage keys were not converted: disk full'
      );
      await queryRunner.rollbackTransaction();
    } finally {
      await queryRunner.release();
    }

    expect(await counts()).toEqual(before);
    expect(await bindingsOf(first)).toEqual([]);
    expect(await bindingsOf(second)).toEqual([]);
  });

  it('changes nothing when it runs again', async () => {
    const storageId = await givenStorage(awsKey('again', 'AKIA5'));
    await convert();
    const written = () =>
      Promise.all(
        [
          'SELECT * FROM credential ORDER BY id',
          'SELECT * FROM credential_owners ORDER BY credential_id, user_id',
          'SELECT * FROM credential_contexts ORDER BY credential_id, context_id',
          'SELECT * FROM credential_consumer_binding ORDER BY id',
        ].map(sql => rows(sql))
      );
    const before = await written();

    await convert();

    expect(await written()).toEqual(before);
    expect(await bindingsOf(storageId)).toHaveLength(1);
  });
});
