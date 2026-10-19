import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { ConnectorAuthoringTestRun } from '../../entities/connector-authoring-test-run.entity';
jest.mock('snowflake-sdk', () => ({}));
jest.mock('../data-mart.service', () => ({ DataMartService: jest.fn() }));
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  addTransactionalDataSource,
  deleteDataSourceByName,
  initializeTransactionalContext,
  StorageDriver,
} from 'typeorm-transactional';
import { MutationReceipt } from '../../../common/mutations/mutation-receipt.entity';
import { MutationReceiptService } from '../../../common/mutations/mutation-receipt.service';
import { CreateConnectorDefinitionTables1788048000000 } from '../../../migrations/1788048000000-create-connector-definition-tables';
import { CreateMutationReceipts1792401000000 } from '../../../migrations/1792401000000-create-mutation-receipts';
import { AddConnectorAuthoring1792406000000 } from '../../../migrations/1792406000000-add-connector-authoring';
import { ConnectorDefinition } from '../../entities/connector-definition.entity';
import { ConnectorDefinitionVersion } from '../../entities/connector-definition-version.entity';
import { ConnectorReferenceGuard } from '../../entities/connector-reference-guard.entity';
import { ConnectorProtectedValues } from '../../entities/connector-protected-values.entity';
import { ConnectorAuthoringPreparation } from '../../entities/connector-authoring-preparation.entity';
import { ConnectorReferenceGuardService } from './connector-reference-guard.service';
import { ConnectorDefinitionService } from './connector-definition.service';
import { ConnectorAuthoringService } from '../../use-cases/connector-authoring.service';
import { McpSetupDiscoveryMapper } from '../../mappers/mcp-setup-discovery.mapper';
import { specificationFromManifest } from './declarative-manifest-schemas';

initializeTransactionalContext({ storageDriver: StorageDriver.AUTO });
const actor = { projectId: 'project', userId: 'author', roles: ['editor'] };
const manifest = {
  version: '1.0',
  name: 'TestSource',
  baseUrl: 'https://api.example.com',
  parameters: {},
  nodes: {
    items: {
      fields: { id: { type: 'string' } },
      uniqueKeys: ['id'],
      request: { method: 'GET', path: '/items', headers: { 'X-Secret': 'private-inline-value' } },
      recordSelector: { recordPath: [] },
    },
  },
};

describe('connector authoring persisted revisions', () => {
  let db: DataSource;
  let service: ConnectorAuthoringService;
  let definitions: ConnectorDefinitionService;
  const receipts = new MutationReceiptService();
  const marts = { findByProjectIdAndDefinitionType: jest.fn() };
  const access = { canAccessMany: jest.fn(), canAccessStored: jest.fn() };
  const tests = { runTest: jest.fn() };
  beforeEach(async () => {
    jest.clearAllMocks();
    marts.findByProjectIdAndDefinitionType.mockResolvedValue([]);
    access.canAccessMany.mockImplementation(
      async (_user, _roles, _type, ids) => new Map(ids.map((id: string) => [id, true]))
    );
    access.canAccessStored.mockResolvedValue(true);
    tests.runTest.mockResolvedValue({
      rows: [{ token: 'never-returned' }],
      sample: [{ token: 'never-returned' }],
      logs: ['never-returned'],
      error: null,
    });
    db = addTransactionalDataSource(
      await new DataSource({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [
          ConnectorDefinition,
          ConnectorDefinitionVersion,
          ConnectorReferenceGuard,
          ConnectorProtectedValues,
          ConnectorAuthoringPreparation,
          ConnectorAuthoringTestRun,
          MutationReceipt,
        ],
        migrations: [
          CreateConnectorDefinitionTables1788048000000,
          CreateMutationReceipts1792401000000,
          AddConnectorAuthoring1792406000000,
        ],
        synchronize: false,
      }).initialize()
    );
    await db.runMigrations();
    definitions = new ConnectorDefinitionService(
      db.getRepository(ConnectorDefinition),
      db.getRepository(ConnectorDefinitionVersion),
      marts as never,
      access as never
    );
    service = new ConnectorAuthoringService(
      definitions,
      receipts,
      marts as never,
      access as never,
      tests as never
    );
  });
  afterEach(async () => {
    deleteDataSourceByName('default');
    await db.destroy();
  });

  const create = () =>
    service.create({
      ...actor,
      operationId: 'create',
      name: manifest.name,
      title: 'Test source',
      manifest,
    });
  const prepare = (connectorId: string, expectedRevision = 1) =>
    service.prepare({
      ...actor,
      connectorId,
      expectedRevision,
      version: 1,
      reviewedNonSecretContent: true,
      protectedPaths: [['nodes', 'items', 'request', 'headers', 'X-Secret']],
    });

  it('serializes references in the domain transaction and rolls back a failed change', async () => {
    const guard = new ConnectorReferenceGuardService();
    await expect(
      db.transaction(async manager => {
        await guard.acquire(manager, actor.projectId);
        throw new Error('rollback');
      })
    ).rejects.toThrow('rollback');
    expect(await db.getRepository(ConnectorReferenceGuard).count()).toBe(0);
    await db.transaction(manager => guard.acquire(manager, actor.projectId));
    expect(await db.getRepository(ConnectorReferenceGuard).count()).toBe(1);
  });

  it('allows exactly one competing persisted CAS from independent SQLite connections', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'connector-authoring-'));
    const filename = join(directory, 'cas.sqlite');
    const disk = await new DataSource({
      type: 'better-sqlite3',
      database: filename,
      entities: [ConnectorDefinition, ConnectorDefinitionVersion],
      synchronize: true,
    }).initialize();
    try {
      const definition = await disk
        .getRepository(ConnectorDefinition)
        .save({ projectId: actor.projectId, name: 'Concurrent', title: 'before', revision: 1 });
      const script = `const { parentPort, workerData } = require('node:worker_threads');
        const Database = require(workerData.driver); const connection = new Database(workerData.filename);
        connection.pragma('busy_timeout = 5000');
        parentPort.on('message', () => {
          try { const result = connection.prepare('UPDATE connector_definition SET title = ?, revision = revision + 1 WHERE id = ? AND projectId = ? AND revision = 1 AND deletedAt IS NULL').run(workerData.title, workerData.id, workerData.projectId); parentPort.postMessage(result.changes); }
          catch (error) { parentPort.postMessage({ error: error.code }); }
          finally { connection.close(); parentPort.close(); }
        }); parentPort.postMessage('ready');`;
      const workers = ['first', 'second'].map(
        title =>
          new Worker(script, {
            eval: true,
            workerData: {
              driver: require.resolve('better-sqlite3'),
              filename,
              title,
              id: definition.id,
              projectId: actor.projectId,
            },
          })
      );
      const outcomes = await Promise.all(
        workers.map(
          worker =>
            new Promise<number>((resolve, reject) => {
              worker.on('error', reject);
              worker.on('message', message => {
                if (message === 'ready') worker.postMessage('start');
                else if (typeof message === 'number') resolve(message);
                else reject(new Error('SQLite worker failed'));
              });
            })
        )
      );
      expect(outcomes.sort()).toEqual([0, 1]);
      expect(
        (await disk.getRepository(ConnectorDefinition).findOneByOrFail({ id: definition.id }))
          .revision
      ).toBe(2);
    } finally {
      await disk.destroy();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('does not accept app confirmation as permission to expose known credential literals', async () => {
    const original = JSON.parse(JSON.stringify(manifest));
    original.nodes.items.request.headers = { Authorization: 'Bearer private-value' };
    const definition = await definitions.create(actor.projectId, actor.userId, {
      name: original.name,
      title: 'existing',
      manifest: original,
    });
    await expect(
      service.prepare({
        ...actor,
        connectorId: definition.id,
        expectedRevision: 1,
        version: 1,
        protectedPaths: [],
        reviewedNonSecretContent: true,
      })
    ).rejects.toThrow('Protect the remaining known credential fields');
    expect(await service.editing(actor, definition.id)).toMatchObject({
      state: 'preparation_required',
      editableDraft: null,
    });
    const prepared = await service.prepare({
      ...actor,
      connectorId: definition.id,
      expectedRevision: 1,
      version: 1,
      protectedPaths: [['nodes', 'items', 'request', 'headers', 'Authorization']],
      reviewedNonSecretContent: true,
    });
    expect(JSON.stringify(prepared)).not.toContain('private-value');
  });

  it('creates from an approved protected reference without accepting unapproved references', async () => {
    const source = await create();
    const prepared = await prepare(source.connectorId);
    const next = { ...prepared.manifest, name: 'SecondSource' };
    await expect(
      service.create({
        ...actor,
        operationId: 'unapproved',
        name: 'SecondSource',
        title: 'Second',
        manifest: next,
      })
    ).rejects.toThrow('Unknown protected reference');
    const created = await service.create({
      ...actor,
      operationId: 'approved',
      name: 'SecondSource',
      title: 'Second',
      manifest: next,
      preparationId: prepared.preparationId,
    });
    const row = await definitions.getVersion(actor.projectId, created.connectorId, 1);
    expect(JSON.stringify(row.manifest)).toContain('private-inline-value');
    expect(JSON.stringify(await service.editing(actor, created.connectorId))).not.toContain(
      'private-inline-value'
    );
  });

  it.each(['copy', 'move'])(
    'rejects a %s of a protected value into published MCP requirements',
    async mode => {
      const created = await create();
      const prepared = await prepare(created.connectorId);
      const unsafe = JSON.parse(JSON.stringify(prepared.manifest)) as Record<string, unknown>;
      const headers = (
        unsafe.nodes as {
          items: { request: { headers: Record<string, unknown> } };
        }
      ).items.request.headers;
      unsafe.parameters = {
        Choice: {
          label: 'Choice',
          requiredType: 'string',
          oneOf: [
            { label: 'Selected', value: headers['X-Secret'], requiredType: 'string', items: {} },
          ],
        },
      };
      if (mode === 'move') delete headers['X-Secret'];

      await expect(
        service.saveDraft({
          ...actor,
          connectorId: created.connectorId,
          expectedRevision: 1,
          preparationId: prepared.preparationId,
          manifest: unsafe,
        })
      ).rejects.toThrow('Protected reference must remain at its reviewed path');
      expect((await definitions.getById(actor.projectId, created.connectorId)).revision).toBe(1);
      expect(
        (await definitions.getVersion(actor.projectId, created.connectorId, 1)).manifest
      ).toEqual(manifest);

      await expect(
        service.create({
          ...actor,
          operationId: `clone-${mode}`,
          name: 'UnsafeClone',
          title: 'Unsafe clone',
          preparationId: prepared.preparationId,
          manifest: { ...unsafe, name: 'UnsafeClone' },
        })
      ).rejects.toThrow('Protected reference must remain at its reviewed path');
      expect(await db.getRepository(ConnectorDefinition).count()).toBe(1);

      const saved = await service.saveDraft({
        ...actor,
        connectorId: created.connectorId,
        expectedRevision: 1,
        preparationId: prepared.preparationId,
        manifest: prepared.manifest,
      });
      await service.publish({
        ...actor,
        connectorId: created.connectorId,
        expectedRevision: saved.revision,
        operationId: 'safe-publication',
        version: 1,
        preparationId: prepared.preparationId,
        impactDigest: (await service.impact(actor, created.connectorId, 1)).impactDigest,
      });
      const published = await definitions.getVersion(actor.projectId, created.connectorId, 1);
      expect(published.status).toBe('published');
      expect(JSON.stringify(published.manifest)).toContain('private-inline-value');
      const requirements = new McpSetupDiscoveryMapper().toRequirements(
        specificationFromManifest(published.manifest)
      );
      expect(JSON.stringify(requirements)).not.toContain('private-inline-value');
      expect(requirements.parameters.some(parameter => parameter.path.startsWith('Choice.'))).toBe(
        false
      );
    }
  );

  it('recovers creation and rejects changed intent without another connector', async () => {
    const first = await create();
    expect(await create()).toEqual(first);
    await expect(
      service.create({
        ...actor,
        operationId: 'create',
        name: manifest.name,
        title: 'changed',
        manifest,
      })
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await db.getRepository(ConnectorDefinition).count()).toBe(1);
  });

  it('rolls back nested creation and receipt together when completion fails', async () => {
    const complete = jest
      .spyOn(receipts, 'complete')
      .mockRejectedValueOnce(new Error('completion failed'));
    await expect(create()).rejects.toThrow('completion failed');
    expect(await db.getRepository(ConnectorDefinition).count()).toBe(0);
    expect(await db.getRepository(ConnectorDefinitionVersion).count()).toBe(0);
    expect(await db.getRepository(MutationReceipt).count()).toBe(0);
    complete.mockRestore();
    expect((await create()).outcome).toBe('completed');
  });

  it('roundtrips app-classified arbitrary values without returning them and requires CAS', async () => {
    const created = await create();
    expect(await service.editing(actor, created.connectorId)).toMatchObject({
      state: 'preparation_required',
      revision: 1,
    });
    const prepared = await prepare(created.connectorId);
    expect(JSON.stringify(prepared)).not.toContain('private-inline-value');
    expect(
      (
        await db
          .getRepository(ConnectorProtectedValues)
          .findOneByOrFail({ connectorId: created.connectorId })
      ).values
    ).toBeUndefined();
    const result = await service.saveDraft({
      ...actor,
      connectorId: created.connectorId,
      expectedRevision: 1,
      preparationId: prepared.preparationId,
      manifest: prepared.manifest,
    });
    expect(result.revision).toBe(2);
    expect(
      (await definitions.getVersion(actor.projectId, created.connectorId, 1)).manifest
    ).toEqual(manifest);
    await expect(
      service.metadata({
        ...actor,
        connectorId: created.connectorId,
        expectedRevision: 1,
        title: 'stale',
      })
    ).rejects.toBeInstanceOf(ConflictException);
    const next = await definitions.updateMetadata(actor.projectId, created.connectorId, {
      title: 'REST',
    });
    expect(next.revision).toBe(3);
    expect(await service.editing(actor, created.connectorId)).toMatchObject({
      state: 'preparation_required',
      revision: 3,
    });
    expect((await definitions.getById(actor.projectId, created.connectorId)).title).toBe('REST');
  });

  it('publishes an exact immutable draft and activation changes only unpinned consumers', async () => {
    const created = await create();
    const prepared = await prepare(created.connectorId);
    const command = {
      ...actor,
      connectorId: created.connectorId,
      operationId: 'publish',
      expectedRevision: 1,
      version: 1,
      preparationId: prepared.preparationId,
      impactDigest: (await service.impact(actor, created.connectorId, 1)).impactDigest,
    };
    const published = await service.publish(command);
    expect(published.revision).toBe(2);
    expect((await definitions.getById(actor.projectId, created.connectorId)).activeVersionId).toBe(
      (await definitions.getVersion(actor.projectId, created.connectorId, 1)).id
    );
    expect(await service.publish(command)).toEqual(published);
    await definitions.saveDraft(actor.projectId, created.connectorId, {
      ...manifest,
      title: 'next',
    });
    expect((await definitions.getVersion(actor.projectId, created.connectorId, 1)).status).toBe(
      'published'
    );
    expect(
      (await definitions.getVersion(actor.projectId, created.connectorId, 1)).manifest
    ).toEqual(manifest);
    marts.findByProjectIdAndDefinitionType.mockResolvedValue([
      { id: 'pinned', definition: { connector: { source: { name: manifest.name, version: 1 } } } },
      { id: 'follower', definition: { connector: { source: { name: manifest.name } } } },
    ]);
    const impact = await service.impact(actor, created.connectorId, 1);
    expect(impact.affectedConsumers).toBe(1);
    await service.activate({
      ...actor,
      connectorId: created.connectorId,
      operationId: 'activate',
      expectedRevision: 3,
      version: 1,
      impactDigest: impact.impactDigest,
    });
    expect(access.canAccessStored).toHaveBeenCalledWith(
      actor.userId,
      actor.roles,
      expect.anything(),
      'follower',
      expect.anything(),
      actor.projectId
    );
    expect(access.canAccessStored).not.toHaveBeenCalledWith(
      actor.userId,
      actor.roles,
      expect.anything(),
      'pinned',
      expect.anything(),
      actor.projectId
    );
  });

  it('binds test approval to actor, project, purpose and saved revision; returns only fixed diagnostics', async () => {
    const created = await create();
    const approval = await service.approveTest({
      ...actor,
      connectorId: created.connectorId,
      expectedRevision: 1,
      version: 1,
      configuration: { Token: 'test-secret' },
    });
    const command = {
      ...actor,
      connectorId: created.connectorId,
      operationId: 'test',
      expectedRevision: 1,
      version: 1,
      approvalId: approval.approvalId,
      node: 'items',
      maxRows: 10,
      maxPages: 1,
      timeoutMs: 1000,
    };
    await expect(service.test({ ...command, userId: 'other' })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    const output = await service.test(command);
    expect(output.test).toEqual({ state: 'succeeded', rowCount: 1, diagnostic: 'test_succeeded' });
    expect(JSON.stringify(output)).not.toMatch(/secret|never-returned/);
    expect(await service.test(command)).toEqual(output);
    expect(tests.runTest).toHaveBeenCalledTimes(1);
    expect(tests.runTest.mock.calls[0][0].configuration).toEqual({ Token: 'test-secret' });
    await service.revoke(actor, approval.approvalId);
    await expect(service.test({ ...command, operationId: 'after-revoke' })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    const next = await service.approveTest({
      ...actor,
      connectorId: created.connectorId,
      expectedRevision: 1,
      version: 1,
      configuration: {},
    });
    await definitions.updateMetadata(actor.projectId, created.connectorId, { title: 'changed' });
    await expect(
      service.test({ ...command, operationId: 'after-edit', approvalId: next.approvalId })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('never redispatches an unknown test and refuses expired and authoring-purpose approvals', async () => {
    const created = await create();
    const prepared = await prepare(created.connectorId);
    const approval = await service.approveTest({
      ...actor,
      connectorId: created.connectorId,
      expectedRevision: 1,
      version: 1,
      configuration: {},
    });
    const command = {
      ...actor,
      connectorId: created.connectorId,
      operationId: 'test',
      expectedRevision: 1,
      version: 1,
      approvalId: approval.approvalId,
      node: 'items',
      maxRows: 10,
      maxPages: 1,
      timeoutMs: 1000,
    };
    await expect(
      service.test({ ...command, approvalId: prepared.preparationId })
    ).rejects.toBeInstanceOf(ForbiddenException);
    await db
      .getRepository(ConnectorAuthoringPreparation)
      .update({ id: approval.approvalId }, { expiresAt: new Date(0) });
    await expect(service.test(command)).rejects.toBeInstanceOf(ForbiddenException);
    await db
      .getRepository(ConnectorAuthoringPreparation)
      .update({ id: approval.approvalId }, { expiresAt: new Date(Date.now() + 60_000) });
    const complete = jest
      .spyOn(receipts, 'complete')
      .mockRejectedValueOnce(new Error('lost completion'));
    await expect(service.test(command)).rejects.toThrow('lost completion');
    complete.mockRestore();
    expect((await service.test(command)).outcome).toBe('unknown');
    expect(tests.runTest).toHaveBeenCalledTimes(1);
  });

  it('refuses publication if edit access to a reviewed unpinned consumer was revoked', async () => {
    const created = await create();
    const prepared = await prepare(created.connectorId);
    marts.findByProjectIdAndDefinitionType.mockResolvedValue([
      {
        id: 'follower',
        revision: 1,
        definition: { connector: { source: { name: manifest.name } } },
      },
    ]);
    const impact = await service.impact(actor, created.connectorId, 1);
    access.canAccessStored.mockResolvedValue(false);
    await expect(
      service.publish({
        ...actor,
        connectorId: created.connectorId,
        expectedRevision: 1,
        operationId: 'publish-denied',
        version: 1,
        preparationId: prepared.preparationId,
        impactDigest: impact.impactDigest,
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(await definitions.getById(actor.projectId, created.connectorId)).toMatchObject({
      revision: 1,
      activeVersionId: null,
    });
    expect((await definitions.getVersion(actor.projectId, created.connectorId, 1)).status).toBe(
      'draft'
    );
    expect(await db.getRepository(MutationReceipt).count()).toBe(1);
  });

  it('does not prepare a historical version over an existing newer draft', async () => {
    const created = await create();
    const prepared = await prepare(created.connectorId);
    await service.publish({
      ...actor,
      connectorId: created.connectorId,
      expectedRevision: 1,
      operationId: 'publish',
      version: 1,
      preparationId: prepared.preparationId,
      impactDigest: (await service.impact(actor, created.connectorId, 1)).impactDigest,
    });
    await definitions.saveDraft(actor.projectId, created.connectorId, manifest);
    await expect(prepare(created.connectorId, 3)).rejects.toBeInstanceOf(ConflictException);
    expect((await definitions.getVersion(actor.projectId, created.connectorId, 2)).status).toBe(
      'draft'
    );
  });

  it('recovers deletion without deleting a later connector with the same source name', async () => {
    const created = await create();
    const impact = await service.impact(actor, created.connectorId, null);
    const command = {
      ...actor,
      connectorId: created.connectorId,
      operationId: 'delete',
      expectedRevision: 1,
      impactDigest: impact.impactDigest,
    };
    const deleted = await service.delete(command);
    await service.create({
      ...actor,
      operationId: 'create-again',
      name: manifest.name,
      title: 'replacement',
      manifest,
    });
    expect(await service.delete(command)).toEqual(deleted);
    expect(await db.getRepository(ConnectorDefinition).count()).toBe(1);
  });
});
