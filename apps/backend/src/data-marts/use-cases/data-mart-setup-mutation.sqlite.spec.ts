jest.mock('../../idp/facades/idp-projections.facade', () => ({ IdpProjectionsFacade: jest.fn() }));
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource, EntitySchema } from 'typeorm';
import {
  addTransactionalDataSource,
  deleteDataSourceByName,
  initializeTransactionalContext,
  StorageDriver,
} from 'typeorm-transactional';
import { MutationReceipt } from '../../common/mutations/mutation-receipt.entity';
import { MutationReceiptService } from '../../common/mutations/mutation-receipt.service';
import { DataMart } from '../entities/data-mart.entity';
import { DataStorage } from '../entities/data-storage.entity';
import { ScheduledTriggerService } from '../services/scheduled-trigger.service';
import { ReportService } from '../services/report.service';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { ConnectorSourceCredentialsService } from '../services/connector/connector-source-credentials.service';
import { DeleteDataMartService } from './delete-data-mart.service';
import { Report } from '../entities/report.entity';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { ConnectorSourceCredentials } from '../entities/connector-source-credentials.entity';
import { ConnectorRunService } from '../services/connector/connector-run.service';
import { ConnectorRunTriggerService } from '../services/connector/connector-run-trigger.service';
import { ConnectorExecutionService } from '../services/connector/connector-execution.service';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMartContext } from '../entities/data-mart-context.entity';
import { serializeSqliteTransactions } from '../../config/sqlite-transaction-serializer';
import { DataMartTechnicalOwner } from '../entities/data-mart-technical-owner.entity';
import { ContextReferenceGuard } from '../entities/context-reference-guard.entity';
import { ConnectorReferenceGuard } from '../entities/connector-reference-guard.entity';
import { ConnectorRunTrigger } from '../entities/connector-run-trigger.entity';
import { DataMartService } from '../services/data-mart.service';
import { ConnectorReferenceGuardService } from '../services/connector/connector-reference-guard.service';
import { McpDataMartSetupFacadeImpl } from '../facades/mcp-data-mart-setup.facade.impl';
import { DataMartSetupMutationService } from './data-mart-setup-mutation.service';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { EntityType } from '../services/access-decision';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { RunType } from '../../common/scheduler/shared/types';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

const storage = new EntitySchema<DataStorage>({
  name: 'A4Storage',
  target: DataStorage,
  columns: {
    id: { type: String, primary: true },
    projectId: { type: String },
    type: { type: String },
    config: { type: 'simple-json', nullable: true },
  },
});
const mart = new EntitySchema<DataMart>({
  name: 'A4Mart',
  target: DataMart,
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    projectId: { type: String },
    title: { type: String },
    icon: { type: String, nullable: true },
    description: { type: String, nullable: true },
    revision: { type: Number, default: 1 },
    createdById: { type: String },
    status: { type: String, default: 'DRAFT' },
    definitionType: { type: String, nullable: true },
    definition: { type: 'simple-json', nullable: true },
    availableForMaintenance: { type: Boolean, default: true },
    availableForReporting: { type: Boolean, default: true },
    dataLastUpdated: { type: 'simple-json', nullable: true },
    schema: { type: 'simple-json', nullable: true },
    schemaActualizedAt: { type: Date, nullable: true },
    schemaInputRevision: { type: Number, nullable: true },
    modifiedAt: { type: Date, updateDate: true },
    createdAt: { type: Date, createDate: true },
    deletedAt: { type: Date, deleteDate: true, nullable: true },
  },
  relations: { storage: { type: 'many-to-one', target: () => DataStorage, eager: true } },
});
const owner = new EntitySchema<DataMartTechnicalOwner>({
  name: 'A4Owner',
  target: DataMartTechnicalOwner,
  columns: { dataMartId: { type: String, primary: true }, userId: { type: String, primary: true } },
});
const contextBinding = new EntitySchema<DataMartContext>({
  name: 'A4ContextBinding',
  target: DataMartContext,
  columns: {
    dataMartId: { type: String, primary: true },
    contextId: { type: String, primary: true },
  },
});
const trigger = new EntitySchema<ConnectorRunTrigger>({
  name: 'A4Trigger',
  target: ConnectorRunTrigger,
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    dataMartRunId: { type: String },
    dataMartId: { type: String },
    projectId: { type: String },
    createdById: { type: String },
    runType: { type: String },
    payload: { type: 'simple-json', nullable: true },
    isActive: { type: Boolean },
    status: { type: String },
  },
});
const run = new EntitySchema<DataMartRun>({
  name: 'A4Run',
  target: DataMartRun,
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    dataMartId: { type: String },
    type: { type: String },
    definitionRun: { type: 'simple-json' },
    status: { type: String },
    createdById: { type: String },
    runType: { type: String },
    logs: { type: 'simple-json', nullable: true },
    errors: { type: 'simple-json', nullable: true },
    additionalParams: { type: 'simple-json', nullable: true },
    finishedAt: { type: Date, nullable: true },
  },
});
const report = new EntitySchema<Report>({
  name: 'A4Report',
  target: Report,
  columns: {
    id: { type: String, primary: true },
    version: { type: Number, default: 1 },
    deletedAt: { type: Date, deleteDate: true, nullable: true },
  },
  relations: { dataMart: { type: 'many-to-one', target: () => DataMart, eager: true } },
});
const schedule = new EntitySchema<DataMartScheduledTrigger>({
  name: 'A4Schedule',
  target: DataMartScheduledTrigger,
  columns: {
    id: { type: String, primary: true },
    type: { type: String },
    isActive: { type: Boolean, default: true },
    cronExpression: { type: String, default: '* * * * *' },
    timeZone: { type: String, default: 'UTC' },
    triggerConfig: { type: 'simple-json', nullable: true },
  },
  relations: { dataMart: { type: 'many-to-one', target: () => DataMart, eager: true } },
});
const relationship = new EntitySchema<DataMartRelationship>({
  name: 'A4Relationship',
  target: DataMartRelationship,
  columns: {
    id: { type: String, primary: true },
    projectId: { type: String },
    targetAlias: { type: String },
    joinConditions: { type: 'simple-json' },
  },
  relations: {
    sourceDataMart: { type: 'many-to-one', target: () => DataMart, eager: true },
    targetDataMart: { type: 'many-to-one', target: () => DataMart, eager: true },
  },
});
const actor = { projectId: 'project', userId: 'editor', roles: ['editor'] };

describe('Data Mart Setup actual persistence and transaction composition', () => {
  let db: DataSource;
  let service: DataMartSetupMutationService;
  let facade: McpDataMartSetupFacadeImpl;
  let marts: DataMartService;
  let receipts: MutationReceiptService;
  let allowed: boolean;
  let legacy: {
    createDataMart: jest.Mock;
    deleteDataMart: jest.Mock;
    getDataMartDetails: jest.Mock;
  };
  let failCompletion: boolean;
  let validation: jest.Mock;
  beforeAll(() =>
    initializeTransactionalContext({ storageDriver: StorageDriver.ASYNC_LOCAL_STORAGE })
  );
  beforeEach(async () => {
    db = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [
        storage,
        mart,
        owner,
        trigger,
        run,
        contextBinding,
        report,
        schedule,
        relationship,
        ConnectorSourceCredentials,
        ContextReferenceGuard,
        ConnectorReferenceGuard,
        MutationReceipt,
      ],
      synchronize: true,
    }).initialize();
    serializeSqliteTransactions(addTransactionalDataSource(db));
    await db.query('CREATE TABLE a4_cache (reportId text PRIMARY KEY)');
    allowed = true;
    failCompletion = false;
    receipts = new MutationReceiptService();
    const complete = receipts.complete.bind(receipts);
    jest.spyOn(receipts, 'complete').mockImplementation(async (...args) => {
      if (failCompletion) throw new Error('after-effect failure');
      await complete(...args);
    });
    marts = new DataMartService(db.getRepository(DataMart), {} as never, {} as never);
    jest
      .spyOn(marts, 'getByIdAndProjectId')
      .mockImplementation(async (id, projectId, manager) =>
        (manager ?? db.manager).getRepository(DataMart).findOneByOrFail({ id, projectId })
      );
    await db
      .getRepository(DataStorage)
      .save({ id: 'storage', projectId: 'project', type: DataStorageType.GOOGLE_BIGQUERY });
    const storages = {
      getByProjectIdAndId: async (projectId: string, id: string) =>
        db.manager.getRepository(DataStorage).findOneByOrFail({ id, projectId }),
    };
    legacy = {
      createDataMart: jest.fn().mockResolvedValue({ id: 'legacy-remote' }),
      deleteDataMart: jest.fn().mockResolvedValue(undefined),
      getDataMartDetails: jest.fn().mockResolvedValue({ id: 'legacy-remote' }),
    };
    validation = jest.fn().mockResolvedValue(undefined);
    service = new DataMartSetupMutationService(
      db,
      receipts,
      marts,
      storages as never,
      { canAccessStored: async () => allowed } as never,
      { impact: async () => ({ revision: 1, impactDigest: 'reviewed' }) } as never,
      { checkIsValid: validation } as never,
      legacy as never,
      new DeleteDataMartService(
        marts,
        new ScheduledTriggerService(db.getRepository(DataMartScheduledTrigger)),
        new ReportService(
          db.getRepository(Report),
          new ScheduledTriggerService(db.getRepository(DataMartScheduledTrigger)),
          {} as never,
          {
            invalidateByReportId: async (id: string) => {
              await db.manager.query('DELETE FROM a4_cache WHERE reportId = ?', [id]);
            },
          } as never
        ),
        legacy as never,
        new ConnectorSourceCredentialsService(db.getRepository(ConnectorSourceCredentials)),
        new DataMartRelationshipService(
          db.getRepository(DataMartRelationship),
          {} as never,
          {} as never
        ),
        { canAccess: async () => allowed } as never,
        db
      ),
      new ConnectorExecutionService(
        new ConnectorRunService(
          db.getRepository(DataMartRun),
          new ConnectorRunTriggerService(db.getRepository(ConnectorRunTrigger)),
          {} as never,
          { now: () => new Date() } as never
        )
      ),
      new ConnectorReferenceGuardService(),
      { getPublicOrigin: () => 'https://app.example.com' } as never,
      {
        resolveConnectorSpecification: async () => [],
        resolveConnectorCapabilities: async () => ({ singleConfiguration: false }),
      } as never
    );
    facade = new McpDataMartSetupFacadeImpl({} as never, service);
  });
  afterEach(async () => {
    deleteDataSourceByName('default');
    if (db?.isInitialized) await db.destroy();
  });
  const create = () =>
    facade.create({ ...actor, title: 'Revenue', storageId: 'storage', operationId: 'create-1' });

  it('creates one mart and owner, recovers retry, and rejects changed intent', async () => {
    const first = await create();
    expect(first).toMatchObject({ state: 'completed', revision: 1 });
    expect(await create()).toEqual(first);
    expect(await db.getRepository(DataMart).count()).toBe(1);
    expect(await db.getRepository(DataMartTechnicalOwner).count()).toBe(1);
    await expect(
      service.create({ ...actor, title: 'Changed', storageId: 'storage', operationId: 'create-1' })
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('rolls back actual mart and owner along with receipt after an after-effect failure', async () => {
    failCompletion = true;
    await expect(create()).rejects.toThrow('after-effect failure');
    expect(await db.getRepository(DataMart).count()).toBe(0);
    expect(await db.getRepository(DataMartTechnicalOwner).count()).toBe(0);
    expect(await db.getRepository(MutationReceipt).count()).toBe(0);
  });
  it('applies metadata atomically, preserves omitted icon and rejects stale revisions', async () => {
    const first = await create();
    const changed = await service.updateMetadata({
      ...actor,
      dataMartId: first.resourceId,
      expectedRevision: 1,
      operationId: 'metadata',
      title: 'New',
      description: null,
    });
    expect(changed.revision).toBe(2);
    await expect(
      service.updateMetadata({
        ...actor,
        dataMartId: first.resourceId,
        expectedRevision: 1,
        operationId: 'stale',
        title: 'Stale',
      })
    ).rejects.toBeInstanceOf(ConflictException);
    const saved = await db.getRepository(DataMart).findOneByOrFail({ id: first.resourceId });
    expect(saved).toMatchObject({ title: 'New', description: null, icon: null, revision: 2 });
  });
  it('does not let an old full-entity save overwrite a newer definition or runtime freshness', async () => {
    const created = await create();
    const old = await db.getRepository(DataMart).findOneByOrFail({ id: created.resourceId });
    await marts.writeConfiguration(db.manager, old.id, actor.projectId, 1, { title: 'New' });
    old.title = 'Stale';
    await expect(marts.save(old)).rejects.toBeInstanceOf(ConflictException);
    expect((await db.getRepository(DataMart).findOneByOrFail({ id: old.id })).title).toBe('New');
  });
  it('keeps an ambiguous Legacy create durable and never dispatches its POST again', async () => {
    await db.getRepository(DataStorage).update('storage', {
      type: DataStorageType.LEGACY_GOOGLE_BIGQUERY,
      config: { projectId: 'gcp' },
    });
    legacy.createDataMart.mockRejectedValue(new Error('ambiguous timeout'));
    expect(await create()).toMatchObject({ state: 'unknown' });
    expect(await create()).toMatchObject({ state: 'unknown' });
    expect(legacy.createDataMart).toHaveBeenCalledTimes(1);
    expect(await db.getRepository(MutationReceipt).find()).toMatchObject([{ status: 'unknown' }]);
  });
  it('requires current Storage permission for every new create operation', async () => {
    await create();
    allowed = false;
    await expect(
      facade.create({ ...actor, title: 'Revenue', storageId: 'storage', operationId: 'new-create' })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('publishes and commits the initial run/trigger with its receipt, recovering one enqueue', async () => {
    const created = await create();
    await db.getRepository(DataMart).update(created.resourceId, {
      definitionType: DataMartDefinitionType.CONNECTOR,
      definition: {
        connector: {
          source: { name: 'Test', configuration: [{}], fields: ['id'], node: 'items' },
          storage: { fullyQualifiedName: 'dataset.table' },
        },
      },
    });
    const request = {
      ...actor,
      dataMartId: created.resourceId,
      expectedRevision: 1,
      operationId: 'publish',
    };
    const published = await facade.publish(request);
    expect(published).toMatchObject({
      revision: 2,
      runId: expect.any(String),
      triggerId: expect.any(String),
      dataReady: false,
    });
    const { audience: _audience, ...publishedReference } = published;
    expect(await facade.publish(request)).toEqual(publishedReference);
    expect(await db.getRepository(ConnectorRunTrigger).count()).toBe(1);
    expect(validation).toHaveBeenCalledTimes(1);
  });
  it('rolls publication and initial queued trigger back with receipt failure', async () => {
    const created = await create();
    await db.getRepository(DataMart).update(created.resourceId, {
      definitionType: DataMartDefinitionType.CONNECTOR,
      definition: {
        connector: {
          source: { name: 'Test', configuration: [{}], fields: ['id'], node: 'items' },
          storage: { fullyQualifiedName: 'dataset.table' },
        },
      },
    });
    failCompletion = true;
    await expect(
      facade.publish({
        ...actor,
        dataMartId: created.resourceId,
        expectedRevision: 1,
        operationId: 'publish',
      })
    ).rejects.toThrow('after-effect failure');
    expect(
      (await db.getRepository(DataMart).findOneByOrFail({ id: created.resourceId })).status
    ).toBe(DataMartStatus.DRAFT);
    expect(await db.getRepository(ConnectorRunTrigger).count()).toBe(0);
    expect(await db.getRepository(DataMartRun).count()).toBe(0);
    expect(await db.getRepository(MutationReceipt).count()).toBe(1);
  });
  it('deletes exactly once, increments revision, and recovers a safe tombstone', async () => {
    const created = await create();
    const request = {
      ...actor,
      dataMartId: created.resourceId,
      expectedRevision: 1,
      operationId: 'delete',
      impactDigest: 'reviewed',
    };
    expect(await facade.delete(request)).toMatchObject({ deleted: true, revision: 2 });
    expect(await facade.delete(request)).toMatchObject({ deleted: true, revision: 2 });
    expect(await db.getRepository(DataMart).count()).toBe(0);
    expect(
      (
        await db
          .getRepository(DataMart)
          .findOne({ where: { id: created.resourceId }, withDeleted: true })
      )?.revision
    ).toBe(2);
  });
  it('serializes concurrent writes from outside the ambient transaction and keeps one CAS winner', async () => {
    const created = await create();
    const results = await Promise.allSettled([
      marts.writeConfiguration(db.manager, created.resourceId, actor.projectId, 1, {
        title: 'first',
      }),
      marts.writeConfiguration(db.manager, created.resourceId, actor.projectId, 1, {
        title: 'second',
      }),
    ]);
    expect(
      results.map(result => (result.status === 'rejected' ? String(result.reason) : 'fulfilled'))
    ).toEqual(expect.arrayContaining(['fulfilled']));
    expect(
      (results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason
    ).toBeInstanceOf(ConflictException);
    expect(
      (await db.getRepository(DataMart).findOneByOrFail({ id: created.resourceId })).revision
    ).toBe(2);
  });
  it.each([
    { type: 'SQL', sqlQuery: 'SELECT 1' },
    { type: 'TABLE', fullyQualifiedName: 'project.dataset.table' },
    { type: 'VIEW', fullyQualifiedName: 'project.dataset.view' },
    { type: 'TABLE_PATTERN', pattern: 'project.dataset.events_*' },
  ])(
    'writes supported $type definitions with CAS and bound configuration revision',
    async definition => {
      const created = await create();
      const result = await service.updateDefinition({
        ...actor,
        dataMartId: created.resourceId,
        expectedRevision: 1,
        operationId: 'definition',
        definition: definition as never,
      });
      expect(result.revision).toBe(2);
      expect(
        (await db.getRepository(DataMart).findOneByOrFail({ id: created.resourceId }))
          .definitionType
      ).toBe(definition.type);
    }
  );
  it('validates same-type published SQL before replacement and preserves ID/status on a valid edit', async () => {
    const created = await create();
    await db.getRepository(DataMart).update(created.resourceId, {
      status: DataMartStatus.PUBLISHED,
      definitionType: DataMartDefinitionType.SQL,
      definition: { sqlQuery: 'SELECT 1' },
    });
    validation.mockRejectedValueOnce(new Error('invalid query'));
    const request = {
      ...actor,
      dataMartId: created.resourceId,
      expectedRevision: 1,
      operationId: 'definition',
      definition: { type: 'SQL', sqlQuery: 'SELECT broken' },
      impactDigest: 'reviewed',
    };
    await expect(service.updateDefinition(request as never)).rejects.toThrow('invalid query');
    expect(
      (await db.getRepository(DataMart).findOneByOrFail({ id: created.resourceId })).definition
    ).toEqual({ sqlQuery: 'SELECT 1' });
    await expect(
      service.updateDefinition({ ...request, impactDigest: 'stale' } as never)
    ).rejects.toBeInstanceOf(ConflictException);
    expect((await service.updateDefinition(request as never)).revision).toBe(2);
    expect(
      await db.getRepository(DataMart).findOneByOrFail({ id: created.resourceId })
    ).toMatchObject({
      id: created.resourceId,
      status: DataMartStatus.PUBLISHED,
      definition: { sqlQuery: 'SELECT broken' },
    });
  });
  it('supports a new connector without secret parameters and returns a saved revision', async () => {
    const created = await create();
    expect(
      await service.updateDefinition({
        ...actor,
        dataMartId: created.resourceId,
        expectedRevision: 1,
        operationId: 'definition',
        definition: {
          type: DataMartRunType.CONNECTOR,
          connectorName: 'Test',
          node: 'items',
          fields: ['id'],
          fullyQualifiedName: 'dataset.table',
        },
      })
    ).toMatchObject({ state: 'completed', revision: 2 });
  });

  it('removes Reports/cache, schedules, queued work, both relationship directions and Context assignments; transfers referenced credentials', async () => {
    const created = await create();
    const other = await service.create({
      ...actor,
      title: 'Other',
      storageId: 'storage',
      operationId: 'other',
    });
    const ownDefinition = {
      connector: {
        source: {
          name: 'Test',
          node: 'items',
          fields: ['id'],
          configuration: [{ _id: 'own-config', _secrets_id: 'secret' }],
        },
        storage: { fullyQualifiedName: 'dataset.table' },
      },
    };
    const heirDefinition = {
      connector: {
        ...ownDefinition.connector,
        source: {
          ...ownDefinition.connector.source,
          configuration: [{ _id: 'heir-config', _secrets_id: 'secret' }],
        },
      },
    };
    await db.getRepository(DataMart).update(created.resourceId, {
      definitionType: DataMartDefinitionType.CONNECTOR,
      definition: ownDefinition as QueryDeepPartialEntity<DataMart>['definition'],
    });
    await db.getRepository(DataMart).update(other.resourceId, {
      definitionType: DataMartDefinitionType.CONNECTOR,
      definition: heirDefinition as QueryDeepPartialEntity<DataMart>['definition'],
    });
    await db.getRepository(Report).save({ id: 'report', dataMart: { id: created.resourceId } });
    await db.query('INSERT INTO a4_cache (reportId) VALUES (?)', ['report']);
    await db.getRepository(DataMartScheduledTrigger).save({
      id: 'schedule',
      type: ScheduledTriggerType.CONNECTOR_RUN,
      dataMart: { id: created.resourceId },
    });
    await db.getRepository(ConnectorRunTrigger).save({
      id: 'queued',
      dataMartId: created.resourceId,
      projectId: actor.projectId,
      dataMartRunId: 'run-queued',
      createdById: actor.userId,
      runType: RunType.manual,
      isActive: true,
      status: TriggerStatus.IDLE,
    });
    await db.getRepository(DataMartRelationship).save([
      {
        id: 'outgoing',
        projectId: actor.projectId,
        sourceDataMart: { id: created.resourceId },
        targetDataMart: { id: other.resourceId },
        targetAlias: 'out',
        joinConditions: [],
      },
      {
        id: 'incoming',
        projectId: actor.projectId,
        sourceDataMart: { id: other.resourceId },
        targetDataMart: { id: created.resourceId },
        targetAlias: 'in',
        joinConditions: [],
      },
    ]);
    await db.getRepository(DataMartRun).save({
      id: 'active-run',
      dataMartId: created.resourceId,
      type: DataMartRunType.CONNECTOR,
      definitionRun: ownDefinition,
      status: DataMartRunStatus.RUNNING,
      createdById: actor.userId,
      runType: RunType.manual,
    });
    await db
      .getRepository(DataMartContext)
      .save({ dataMartId: created.resourceId, contextId: 'context' });
    await db.getRepository(ConnectorSourceCredentials).save({
      id: 'secret',
      projectId: actor.projectId,
      connectorName: 'Test',
      dataMartId: created.resourceId,
      configId: 'own-config',
      credentials: { token: 'never-output' },
    });
    await facade.delete({
      ...actor,
      dataMartId: created.resourceId,
      expectedRevision: 1,
      operationId: 'delete',
      impactDigest: 'reviewed',
    });
    expect(await db.getRepository(Report).count()).toBe(0);
    expect(await db.query('SELECT * FROM a4_cache')).toEqual([]);
    expect(await db.getRepository(DataMartScheduledTrigger).count()).toBe(0);
    expect(await db.getRepository(ConnectorRunTrigger).count()).toBe(0);
    expect(await db.getRepository(DataMartRelationship).count()).toBe(0);
    expect(await db.getRepository(DataMartContext).count()).toBe(0);
    expect(
      await db.getRepository(ConnectorSourceCredentials).findOneByOrFail({ id: 'secret' })
    ).toMatchObject({ dataMartId: other.resourceId, configId: 'heir-config' });
    expect(await db.getRepository(DataMart).count()).toBe(1);
    expect(
      await db.getRepository(DataMart).findOneByOrFail({ id: other.resourceId })
    ).toMatchObject({ revision: 2 });
    expect(await db.getRepository(DataMartRun).findOneByOrFail({ id: 'active-run' })).toMatchObject(
      { status: 'CANCELLED', finishedAt: expect.any(Date) }
    );
  });
  it('preserves normal Legacy creation and recovers the known resulting ID without another POST', async () => {
    await db.getRepository(DataStorage).update('storage', {
      type: DataStorageType.LEGACY_GOOGLE_BIGQUERY,
      config: { projectId: 'gcp' },
    });
    expect(await create()).toMatchObject({
      state: 'completed',
      resourceId: 'legacy-remote',
      revision: 1,
    });
    expect(await create()).toMatchObject({
      state: 'completed',
      resourceId: 'legacy-remote',
      revision: 1,
    });
    expect(legacy.createDataMart).toHaveBeenCalledTimes(1);
  });
  it('reconciles an ambiguous Legacy deletion by known-ID 404 without repeating DELETE', async () => {
    await db.getRepository(DataStorage).update('storage', {
      type: DataStorageType.LEGACY_GOOGLE_BIGQUERY,
      config: { projectId: 'gcp' },
    });
    const created = await create();
    legacy.deleteDataMart.mockRejectedValue(new Error('lost response'));
    const request = {
      ...actor,
      dataMartId: created.resourceId,
      expectedRevision: 1,
      operationId: 'delete',
      impactDigest: 'reviewed',
    };
    expect(await facade.delete(request)).toMatchObject({
      state: 'unknown',
      resourceId: created.resourceId,
    });
    expect(await facade.delete(request)).toMatchObject({
      state: 'unknown',
      resourceId: created.resourceId,
    });
    legacy.getDataMartDetails.mockRejectedValue(new NotFoundException());
    expect(await facade.delete(request)).toMatchObject({ state: 'completed', deleted: true });
    expect(legacy.deleteDataMart).toHaveBeenCalledTimes(1);
    expect(await db.getRepository(DataMart).count()).toBe(0);
  });
  it('bumps each surviving incoming source once and rolls it back with deletion on failure', async () => {
    const target = await create();
    const source = await facade.create({
      ...actor,
      title: 'Source',
      storageId: 'storage',
      operationId: 'create-source-cascade',
    });
    await db.getRepository(DataMartRelationship).save([
      {
        id: 'incoming-a',
        projectId: actor.projectId,
        sourceDataMart: { id: source.resourceId },
        targetDataMart: { id: target.resourceId },
        targetAlias: 'a',
        joinConditions: [],
      },
      {
        id: 'incoming-b',
        projectId: actor.projectId,
        sourceDataMart: { id: source.resourceId },
        targetDataMart: { id: target.resourceId },
        targetAlias: 'b',
        joinConditions: [],
      },
    ]);
    const request = {
      ...actor,
      dataMartId: target.resourceId,
      expectedRevision: 1,
      operationId: 'delete-cascade',
      impactDigest: 'reviewed',
    };
    failCompletion = true;
    await expect(facade.delete(request)).rejects.toThrow('after-effect failure');
    expect(await db.getRepository(DataMartRelationship).count()).toBe(2);
    expect(
      await db.getRepository(DataMart).findOneByOrFail({ id: source.resourceId })
    ).toMatchObject({ revision: 1 });
    expect(
      await db.getRepository(DataMart).findOneByOrFail({ id: target.resourceId })
    ).toMatchObject({ revision: 1 });
    failCompletion = false;
    await facade.delete(request);
    expect(await db.getRepository(DataMartRelationship).count()).toBe(0);
    expect(
      await db.getRepository(DataMart).findOneByOrFail({ id: source.resourceId })
    ).toMatchObject({ revision: 2 });
  });
  it('recovers the original create and publication references after later deletion', async () => {
    const created = await create();
    await db.getRepository(DataMart).update(created.resourceId, {
      definitionType: DataMartDefinitionType.SQL,
      definition: { sqlQuery: 'SELECT 1' },
    });
    const publishRequest = {
      ...actor,
      dataMartId: created.resourceId,
      expectedRevision: 1,
      operationId: 'publish-recovery',
    };
    const published = await facade.publish(publishRequest);
    jest
      .spyOn(service['setup'], 'impact')
      .mockResolvedValue({ revision: 2, impactDigest: 'reviewed' } as never);
    await facade.delete({
      ...actor,
      dataMartId: created.resourceId,
      expectedRevision: 2,
      impactDigest: 'reviewed',
      operationId: 'delete-recovery',
    });
    await expect(create()).resolves.toEqual(created);
    await expect(facade.publish(publishRequest)).resolves.toMatchObject({
      resourceId: created.resourceId,
      revision: published.revision,
      publicationState: 'PUBLISHED',
    });
    expect(await db.getRepository(DataMart).count()).toBe(0);
  });
  it('recovers safe references after local self-removal without reading entity data', async () => {
    const created = await create();
    await db.getRepository(DataMart).update(created.resourceId, {
      definitionType: DataMartDefinitionType.SQL,
      definition: { sqlQuery: 'SELECT 1' },
    });
    const request = {
      ...actor,
      dataMartId: created.resourceId,
      expectedRevision: 1,
      operationId: 'publish-recovery',
    };
    await facade.publish(request);
    allowed = false;
    const entityRead = jest.spyOn(marts, 'getByIdAndProjectId');
    entityRead.mockClear();
    await expect(create()).resolves.toEqual(created);
    const recovered = await facade.publish(request);
    expect(recovered).toMatchObject({
      resourceId: created.resourceId,
      revision: 2,
      publicationState: 'PUBLISHED',
    });
    expect(recovered.audience).toBeUndefined();
    expect(entityRead).not.toHaveBeenCalled();
    await expect(
      facade.create({ ...actor, title: 'Changed', storageId: 'storage', operationId: 'create-1' })
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(facade.publish({ ...request, expectedRevision: 2 })).rejects.toBeInstanceOf(
      ConflictException
    );
    await expect(
      facade.create({
        ...actor,
        roles: ['viewer'],
        title: 'Revenue',
        storageId: 'storage',
        operationId: 'create-1',
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(facade.publish({ ...request, roles: ['viewer'] })).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });
  it.each([
    { connectorName: 'Old', version: undefined, expectedVersion: 7 },
    { connectorName: 'New', version: undefined, expectedVersion: undefined },
    { connectorName: 'New', version: 2, expectedVersion: 2 },
  ])(
    'uses only the selected connector pin: $connectorName/$version',
    async ({ connectorName, version, expectedVersion }) => {
      const created = await create();
      await db.getRepository(DataMart).update(created.resourceId, {
        definitionType: DataMartDefinitionType.CONNECTOR,
        definition: {
          connector: {
            source: {
              name: 'Old',
              node: 'items',
              fields: ['id'],
              version: 7,
              configuration: [{ _id: 'old' }],
            },
            storage: { fullyQualifiedName: 'dataset.table' },
          },
        } as never,
      });
      await service.updateDefinition({
        ...actor,
        dataMartId: created.resourceId,
        expectedRevision: 1,
        operationId: 'connector-change',
        definition: {
          type: DataMartRunType.CONNECTOR,
          connectorName,
          version,
          node: 'items',
          fields: ['id'],
          fullyQualifiedName: 'dataset.table',
        },
      });
      const saved = await db.getRepository(DataMart).findOneByOrFail({ id: created.resourceId });
      expect(
        (saved.definition as { connector: { source: { version?: number } } }).connector.source
          .version
      ).toBe(expectedVersion);
    }
  );
  it.each(['definition', 'publish'])(
    'rechecks Storage USE after live validation for %s',
    async operation => {
      const created = await create();
      await db.getRepository(DataMart).update(created.resourceId, {
        status: operation === 'definition' ? DataMartStatus.PUBLISHED : DataMartStatus.DRAFT,
        definitionType: DataMartDefinitionType.SQL,
        definition: { sqlQuery: 'SELECT 1' },
      });
      let storageAllowed = true;
      jest
        .spyOn(service['access'], 'canAccessStored')
        .mockImplementation(
          async (_userId, _roles, entityType) => entityType !== EntityType.STORAGE || storageAllowed
        );
      validation.mockImplementation(async () => {
        storageAllowed = false;
      });
      const request = {
        ...actor,
        dataMartId: created.resourceId,
        expectedRevision: 1,
        operationId: 'validated',
      };
      await expect(
        operation === 'definition'
          ? facade.updateDefinition({
              ...request,
              impactDigest: 'reviewed',
              definition: { type: 'SQL', sqlQuery: 'SELECT 2' },
            })
          : facade.publish(request)
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(
        await db.getRepository(DataMart).findOneByOrFail({ id: created.resourceId })
      ).toMatchObject({
        revision: 1,
        status: operation === 'definition' ? DataMartStatus.PUBLISHED : DataMartStatus.DRAFT,
        definition: { sqlQuery: 'SELECT 1' },
      });
    }
  );

  it('rechecks Storage USE after acquiring the create reference guard', async () => {
    let storageAllowed = true;
    jest
      .spyOn(service['access'], 'canAccessStored')
      .mockImplementation(
        async (_userId, _roles, entityType) => entityType !== EntityType.STORAGE || storageAllowed
      );
    jest.spyOn(service['connectorGuard'], 'acquire').mockImplementation(async () => {
      storageAllowed = false;
    });
    await expect(create()).rejects.toBeInstanceOf(ForbiddenException);
    expect(await db.getRepository(DataMart).count()).toBe(0);
    expect(await db.getRepository(MutationReceipt).count()).toBe(0);
  });
});
