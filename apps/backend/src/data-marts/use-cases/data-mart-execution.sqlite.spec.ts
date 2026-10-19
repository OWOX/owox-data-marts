jest.mock('snowflake-sdk', () => ({ __esModule: true, default: {} }));
jest.mock('../../idp/facades/idp-projections.facade', () => ({ IdpProjectionsFacade: jest.fn() }));
import { DataSource, EntitySchema } from 'typeorm';
import {
  addTransactionalDataSource,
  deleteDataSourceByName,
  initializeTransactionalContext,
  runInTransaction,
  StorageDriver,
} from 'typeorm-transactional';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { serializeSqliteTransactions } from '../../config/sqlite-transaction-serializer';
import { MutationReceipt } from '../../common/mutations/mutation-receipt.entity';
import { MutationReceiptService } from '../../common/mutations/mutation-receipt.service';
import { ConnectorExecutorService } from '../services/connector/connector-executor.service';
import { DataStorage } from '../entities/data-storage.entity';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { ConnectorRunTrigger } from '../entities/connector-run-trigger.entity';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { ContextReferenceGuard } from '../entities/context-reference-guard.entity';
import { ConnectorReferenceGuard } from '../entities/connector-reference-guard.entity';
import { DataMartService } from '../services/data-mart.service';
import { ConnectorRunService } from '../services/connector/connector-run.service';
import { ConnectorRunTriggerHandlerService } from '../services/connector/connector-run-trigger-handler.service';
import { ConnectorRunTriggerService } from '../services/connector/connector-run-trigger.service';
import { ConnectorExecutionService } from '../services/connector/connector-execution.service';
import { cancelDataMartConnectorWork } from '../services/connector/connector-work-lifecycle';
import { createNextSegmentRun } from '../services/connector/backfill-segment';
import { PublishDataMartService } from './publish-data-mart.service';
import { EntityType } from '../services/access-decision';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataMartExecutionService } from './data-mart-execution.service';
import { McpDataMartExecutionMapper } from '../mappers/mcp-data-mart-execution.mapper';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { ScheduledTriggersHandlerService } from '../services/scheduled-triggers-handler.service';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { AbstractTriggerRunnerService } from '../../common/scheduler/services/runners/abstract-trigger-runner.service';
import { RunType } from '../../common/scheduler/shared/types';
import { UpdateScheduledTriggerService } from './update-scheduled-trigger.service';
import { CreateScheduledTriggerService } from './create-scheduled-trigger.service';
import { DeleteScheduledTriggerService } from './delete-scheduled-trigger.service';
import { ScheduledTriggerService } from '../services/scheduled-trigger.service';
import { ScheduledTriggerMapper } from '../mappers/scheduled-trigger.mapper';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';

const storage = new EntitySchema({
  name: 'A6Storage',
  target: DataStorage,
  columns: {
    id: { type: String, primary: true },
    projectId: { type: String },
    type: { type: String },
  },
});
const mart = new EntitySchema<DataMart>({
  name: 'A6Mart',
  target: DataMart,
  columns: {
    id: { type: String, primary: true },
    projectId: { type: String },
    revision: { type: Number, default: 1 },
    status: { type: String, default: 'PUBLISHED' },
    definitionType: { type: String, default: 'CONNECTOR' },
    definition: { type: 'simple-json', default: '{}' },
    schema: { type: 'simple-json', nullable: true },
    schemaActualizedAt: { type: Date, nullable: true },
    schemaInputRevision: { type: Number, nullable: true },
    description: { type: String, nullable: true },
    deletedAt: { type: Date, deleteDate: true, nullable: true },
  },
  relations: { storage: { type: 'many-to-one', target: () => DataStorage, eager: true } },
});
const run = new EntitySchema<DataMartRun>({
  name: 'A6Run',
  target: DataMartRun,
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    dataMartId: { type: String },
    type: { type: String },
    status: { type: String },
    runType: { type: String },
    createdById: { type: String },
    definitionRun: { type: 'simple-json' },
    logs: { type: 'simple-json', nullable: true },
    errors: { type: 'simple-json', nullable: true },
    additionalParams: { type: 'simple-json', nullable: true },
    createdAt: { type: Date, createDate: true },
    finishedAt: { type: Date, nullable: true },
    startedAt: { type: Date, nullable: true },
  },
  relations: {
    dataMart: { type: 'many-to-one', target: () => DataMart, joinColumn: { name: 'dataMartId' } },
  },
});
const trigger = new EntitySchema({
  name: 'A6RunTrigger',
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
    version: { type: Number, version: true },
  },
});
const schedule = new EntitySchema<DataMartScheduledTrigger>({
  name: 'A6Schedule',
  target: DataMartScheduledTrigger,
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    type: { type: String },
    cronExpression: { type: String },
    timeZone: { type: String },
    isActive: { type: Boolean },
    nextRunTimestamp: { type: Date, nullable: true },
    lastRunTimestamp: { type: Date, nullable: true },
    status: { type: String, default: 'IDLE' },
    version: { type: Number, version: true },
    triggerConfig: { type: 'simple-json', nullable: true },
    createdById: { type: String },
    createdAt: { type: Date, createDate: true },
    modifiedAt: { type: Date, updateDate: true },
  },
  relations: { dataMart: { type: 'many-to-one', target: () => DataMart, eager: true } },
});
const actor = { dataMartId: 'dm', projectId: 'project', userId: 'editor', roles: ['editor'] };
const load = { ...actor, operationId: 'load-1', expectedRevision: 1 };
const save = {
  ...actor,
  operationId: 'schedule-1',
  expectedRevision: 1,
  cronExpression: '0 9 * * *',
  timeZone: 'UTC',
  enabled: true,
};

describe('Data Mart execution actual SQLite persistence', () => {
  let db: DataSource;
  let service: DataMartExecutionService;
  let marts: DataMartService;
  let receipts: MutationReceiptService;
  let engine: ConnectorRunService;
  let triggers: ConnectorRunTriggerService;
  let allowed: boolean;
  let storageAllowed: boolean;
  let failCompletion: boolean;
  let manualRuns: { checkStorageAccess: jest.Mock };
  let schemaProvider: { getActualDataMartSchema: jest.Mock };
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
        run,
        trigger,
        schedule,
        MutationReceipt,
        ContextReferenceGuard,
        ConnectorReferenceGuard,
      ],
      synchronize: true,
    }).initialize();
    serializeSqliteTransactions(addTransactionalDataSource(db));
    await db
      .getRepository(DataStorage)
      .insert({ id: 'storage', projectId: 'project', type: 'GOOGLE_BIGQUERY' as any });
    await db.getRepository(DataMart).insert({
      id: 'dm',
      projectId: 'project',
      definition: {} as any,
      storage: { id: 'storage' },
    });
    schemaProvider = { getActualDataMartSchema: jest.fn().mockResolvedValue({ fields: [] }) };
    marts = new DataMartService(
      db.getRepository(DataMart),
      schemaProvider as any,
      { mergeSchemas: async (_type: unknown, _old: unknown, current: unknown) => current } as any
    );
    marts.getByIdAndProjectId = async (id, projectId, manager) =>
      (manager ?? db.manager).findOneByOrFail(DataMart, { id, projectId });
    triggers = new ConnectorRunTriggerService(db.getRepository(ConnectorRunTrigger));
    engine = new ConnectorRunService(
      db.getRepository(DataMartRun),
      triggers,
      {} as any,
      { now: () => new Date('2026-10-19T12:00:00Z') } as any
    );
    receipts = new MutationReceiptService();
    failCompletion = false;
    const complete = receipts.complete.bind(receipts);
    receipts.complete = async (...args) => {
      if (failCompletion) throw new Error('receipt completion failed');
      return complete(...args);
    };
    allowed = true;
    storageAllowed = true;
    manualRuns = { checkStorageAccess: jest.fn().mockResolvedValue(undefined) };
    service = new DataMartExecutionService(
      marts,
      {
        getByIdAndDataMartId: (id: string, dataMartId: string) =>
          db.getRepository(DataMartRun).findOneBy({ id, dataMartId }),
      } as any,
      new ScheduledTriggerService(db.getRepository(DataMartScheduledTrigger)),
      {
        canAccess: async (_user: string, _roles: string[], type: EntityType) =>
          type === EntityType.STORAGE ? storageAllowed : allowed,
        canAccessStored: async (_user: string, _roles: string[], type: EntityType) =>
          type === EntityType.STORAGE ? storageAllowed : allowed,
      } as any,
      {} as any,
      new McpDataMartExecutionMapper(),
      db,
      receipts,
      new ConnectorExecutionService(engine),
      manualRuns as any
    );
  });
  afterEach(async () => {
    deleteDataSourceByName('default');
    await db.destroy();
  });

  it('commits one run and trigger with its receipt; response loss and concurrent retries recover the same references', async () => {
    const [first, replay] = await Promise.all([
      service.runDataMart(load),
      service.runDataMart(load),
    ]);
    expect(first).toMatchObject({ outcome: 'completed', revision: 1 });
    expect(replay.runId).toBe(first.runId);
    expect(replay.triggerId).toBe(first.triggerId);
    expect(await db.getRepository(DataMartRun).count()).toBe(1);
    expect(await db.getRepository(ConnectorRunTrigger).count()).toBe(1);
    expect(await db.getRepository(MutationReceipt).count()).toBe(1);
    expect((await db.getRepository(DataMart).findOneByOrFail({ id: 'dm' })).revision).toBe(1);
  });
  it('keeps configuration binding outside the default scheduled connector payload', async () => {
    const mart = await db.getRepository(DataMart).findOneByOrFail({ id: 'dm' });
    const id = await engine.run(mart, actor.userId, RunType.scheduled);
    const stored = await db.getRepository(DataMartRun).findOneByOrFail({ id });
    expect(stored.additionalParams).toEqual({ payload: {}, configurationRevision: 1 });
    expect(
      (await db.getRepository(ConnectorRunTrigger).findOneByOrFail({ dataMartRunId: id })).payload
    ).toEqual({ payload: {}, configurationRevision: 1 });
  });
  function runHandler() {
    const executeExistingRun = jest.fn().mockResolvedValue(undefined);
    const handler = new ConnectorRunTriggerHandlerService(
      db.getRepository(ConnectorRunTrigger),
      db.getRepository(DataMartRun),
      {} as any,
      { executeExistingRun } as any,
      marts,
      { findById: (id: string) => db.getRepository(DataMartRun).findOneBy({ id }) } as any,
      { get: () => 3 } as any,
      db
    );
    return { handler, executeExistingRun };
  }
  it('publication binds its final revision before the initial run is successfully claimed', async () => {
    await db.getRepository(DataMart).update('dm', { status: DataMartStatus.DRAFT });
    const publication = new PublishDataMartService(
      marts,
      { checkIsValid: async () => undefined } as any,
      { toDomainDto: (mart: DataMart) => mart } as any,
      { publish: async () => undefined } as any,
      { canAccess: async () => true } as any,
      new ConnectorExecutionService(engine)
    );
    const published = await publication.run({
      id: actor.dataMartId,
      projectId: actor.projectId,
      userId: actor.userId,
      roles: actor.roles,
      createdById: actor.userId,
    });
    const stored = (await db.getRepository(DataMartRun).find())[0];
    expect(published.revision).toBe(2);
    expect(stored.additionalParams?.configurationRevision).toBe(published.revision);
    const trigger = await db
      .getRepository(ConnectorRunTrigger)
      .findOneByOrFail({ dataMartRunId: stored.id });
    const { handler, executeExistingRun } = runHandler();
    await handler.handleTrigger(trigger);
    expect(executeExistingRun).toHaveBeenCalledTimes(1);
    expect((await db.getRepository(DataMartRun).findOneByOrFail({ id: stored.id })).status).toBe(
      DataMartRunStatus.RUNNING
    );
  });
  it('rejects a queued load whose definition changed before claim, before any provider dispatch', async () => {
    const queued = await service.runDataMart(load);
    await runInTransaction(() =>
      marts.writeConfiguration(db.manager, 'dm', 'project', 1, {
        definition: { changed: true } as any,
      })
    );
    const trigger = await db
      .getRepository(ConnectorRunTrigger)
      .findOneByOrFail({ id: queued.triggerId! });
    const { handler, executeExistingRun } = runHandler();
    await expect(handler.handleTrigger(trigger)).rejects.toThrow(
      'configuration changed since this load was queued'
    );
    expect(executeExistingRun).not.toHaveBeenCalled();
    const failed = await db.getRepository(DataMartRun).findOneByOrFail({ id: queued.runId! });
    expect(failed.status).toBe(DataMartRunStatus.FAILED);
    expect(failed.finishedAt).toBeInstanceOf(Date);
    expect(failed.errors).toEqual([
      'Data Mart configuration changed since this load was queued. Start a new load from the current configuration.',
    ]);
    expect(
      (await db.getRepository(ConnectorRunTrigger).findOneByOrFail({ id: queued.triggerId! }))
        .isActive
    ).toBe(false);
  });
  it.each(['none', 'before-fields', 'during-schema'] as const)(
    'successful segmented execution rebinds only its own field/schema changes; concurrent edit=%s',
    async concurrentEdit => {
      await db.getRepository(DataMart).update('dm', {
        definition: {
          connector: {
            source: {
              name: 'source',
              node: 'node',
              configuration: [{ _id: 'config' }],
              fields: ['old'],
            },
            storage: { fullyQualifiedName: 'project.dataset.table' },
          },
        } as any,
      });
      const queued = await service.runDataMart({
        ...load,
        load: { runType: 'MANUAL_BACKFILL', startDate: '2026-01-01', endDate: '2026-06-01' },
      });
      if (concurrentEdit === 'during-schema')
        schemaProvider.getActualDataMartSchema.mockImplementation(async () => {
          await runInTransaction(() =>
            marts.writeConfiguration(db.manager, 'dm', 'project', 2, {
              description: 'Concurrent user edit',
            })
          );
          return { fields: [] };
        });
      const executor = new ConnectorExecutorService(
        db.getRepository(DataMartRun),
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {
          registerActiveProcess: () => undefined,
          unregisterActiveProcess: () => undefined,
          isInShutdownMode: () => false,
        } as any,
        { now: () => new Date() } as any,
        { publishExternal: async () => undefined } as any,
        {
          verifyCanPerformOperations: async () => undefined,
          registerConnectorRunConsumption: async () => undefined,
        } as any,
        marts,
        {} as any,
        {} as any,
        {} as any,
        triggers
      );
      (executor as any).createRunLogFlusher = () => null;
      (executor as any).runConnectorConfigurations = async () => {
        if (concurrentEdit === 'before-fields')
          await runInTransaction(() =>
            marts.writeConfiguration(db.manager, 'dm', 'project', 1, {
              description: 'Concurrent user edit',
            })
          );
        return [
          {
            configIndex: 0,
            success: true,
            logs: [],
            errors: [],
            fieldsUpdate: { fields: ['new'] },
            backfillLoadedThrough: '2026-01-31',
          },
        ];
      };
      const { handler, executeExistingRun } = runHandler();
      executeExistingRun.mockImplementation((mart, run, payload) =>
        executor.executeInBackground(mart, run, payload)
      );
      await handler.handleTrigger(
        await db.getRepository(ConnectorRunTrigger).findOneByOrFail({ id: queued.triggerId! })
      );
      expect(
        (await db.getRepository(DataMartRun).findOneByOrFail({ id: queued.runId! })).status
      ).toBe(DataMartRunStatus.SUCCESS);
      const successor = (await db.getRepository(DataMartRun).find()).find(
        run => run.id !== queued.runId
      )!;
      expect(successor).toBeDefined();
      const current = await db.getRepository(DataMart).findOneByOrFail({ id: 'dm' });
      expect(current.revision).toBe(concurrentEdit === 'before-fields' ? 2 : 3);
      expect(successor.additionalParams?.configurationRevision).toBe(
        concurrentEdit === 'before-fields'
          ? 1
          : concurrentEdit === 'during-schema'
            ? 2
            : current.revision
      );
      if (concurrentEdit === 'before-fields')
        expect(schemaProvider.getActualDataMartSchema).not.toHaveBeenCalled();
      executeExistingRun.mockReset().mockResolvedValue(undefined);
      const nextTrigger = await db
        .getRepository(ConnectorRunTrigger)
        .findOneByOrFail({ dataMartRunId: successor.id });
      if (concurrentEdit !== 'none') {
        await expect(handler.handleTrigger(nextTrigger)).rejects.toThrow(
          'configuration changed since this load was queued'
        );
        expect(executeExistingRun).not.toHaveBeenCalled();
      } else {
        await handler.handleTrigger(nextTrigger);
        expect(executeExistingRun).toHaveBeenCalledTimes(1);
        expect(
          (await db.getRepository(DataMartRun).findOneByOrFail({ id: successor.id })).status
        ).toBe(DataMartRunStatus.RUNNING);
      }
    }
  );
  it('checks the optional schema input revision before warehouse work while preserving unconditioned callers', async () => {
    await db.getRepository(DataMart).update('dm', { revision: 2 });
    await expect(marts.actualizeSchema('dm', 'project', 1)).rejects.toThrow(ConflictException);
    expect(schemaProvider.getActualDataMartSchema).not.toHaveBeenCalled();
    expect((await marts.actualizeSchema('dm', 'project')).revision).toBe(3);
    expect(schemaProvider.getActualDataMartSchema).toHaveBeenCalledTimes(1);
  });
  it('serializes distinct enqueue requests and keeps only one live load', async () => {
    const results = await Promise.allSettled([
      service.runDataMart(load),
      service.runDataMart({ ...load, operationId: 'another-load' }),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(await db.getRepository(DataMartRun).count()).toBe(1);
    expect(await db.getRepository(MutationReceipt).count()).toBe(1);
  });
  it('a concurrent deletion leaves no active run or trigger, regardless of enqueue order', async () => {
    const results = await Promise.allSettled([
      service.runDataMart(load),
      runInTransaction(async () => {
        await cancelDataMartConnectorWork(db.manager, 'dm', 'project');
        await db.getRepository(DataMart).softDelete('dm');
      }),
    ]);
    expect(results[1].status).toBe('fulfilled');
    expect(await db.getRepository(DataMartRun).countBy({ status: DataMartRunStatus.PENDING })).toBe(
      0
    );
    expect(await db.getRepository(DataMartRun).countBy({ status: DataMartRunStatus.RUNNING })).toBe(
      0
    );
    expect(await db.getRepository(ConnectorRunTrigger).countBy({ isActive: true })).toBe(0);
  });
  it('recovers an enqueued run after credentials expire without repeating provider preflight', async () => {
    const first = await service.runDataMart(load);
    manualRuns.checkStorageAccess.mockRejectedValue(new Error('credentials expired'));
    expect(await service.runDataMart(load)).toMatchObject({
      outcome: 'completed',
      runId: first.runId,
      triggerId: first.triggerId,
    });
    expect(manualRuns.checkStorageAccess).toHaveBeenCalledTimes(1);
    expect(await db.getRepository(DataMartRun).count()).toBe(1);
  });
  it.each(['before-preflight', 'during-preflight'] as const)(
    'requires current Storage USE %s before new enqueue',
    async timing => {
      if (timing === 'before-preflight') storageAllowed = false;
      else
        manualRuns.checkStorageAccess.mockImplementation(async () => {
          storageAllowed = false;
        });
      await expect(service.runDataMart(load)).rejects.toThrow('permission to use this Storage');
      expect(manualRuns.checkStorageAccess).toHaveBeenCalledTimes(
        timing === 'before-preflight' ? 0 : 1
      );
      expect(await db.getRepository(DataMartRun).count()).toBe(0);
      expect(await db.getRepository(ConnectorRunTrigger).count()).toBe(0);
      expect(await db.getRepository(MutationReceipt).count()).toBe(0);
    }
  );
  it.each(['self-removal', 'data-mart-deleted'] as const)(
    'recovers only historical references after %s and still enforces actor/intent identity',
    async mode => {
      const enqueued = await service.runDataMart(load);
      const created = await service.saveSchedule(save);
      const remove = {
        ...actor,
        scheduleId: created.resourceId,
        operationId: 'delete-schedule',
        expectedRevision: 2,
      };
      const deleted = await service.deleteSchedule(remove);
      if (mode === 'data-mart-deleted')
        await runInTransaction(async () => {
          await cancelDataMartConnectorWork(db.manager, 'dm', 'project');
          await db.getRepository(DataMart).softDelete('dm');
        });
      allowed = false;
      storageAllowed = false;
      manualRuns.checkStorageAccess.mockRejectedValue(new Error('credentials expired'));
      const read = jest.spyOn(marts, 'getByIdAndProjectId');
      expect(await service.runDataMart(load)).toMatchObject({
        resourceId: enqueued.resourceId,
        runId: enqueued.runId,
        triggerId: enqueued.triggerId,
        outcome: 'completed',
      });
      expect(await service.saveSchedule(save)).toMatchObject({
        resourceId: created.resourceId,
        revision: created.revision,
        outcome: 'completed',
      });
      expect(await service.deleteSchedule(remove)).toMatchObject({
        resourceId: deleted.resourceId,
        revision: deleted.revision,
        deleted: true,
      });
      expect(read).not.toHaveBeenCalled();
      await expect(service.runDataMart({ ...load, roles: ['viewer'] })).rejects.toThrow(
        ForbiddenException
      );
      await expect(service.runDataMart({ ...load, expectedRevision: 99 })).rejects.toThrow(
        ConflictException
      );
      await expect(service.saveSchedule({ ...save, cronExpression: '0 10 * * *' })).rejects.toThrow(
        ConflictException
      );
      await expect(service.deleteSchedule({ ...remove, expectedRevision: 99 })).rejects.toThrow(
        ConflictException
      );
      await expect(service.runDataMart({ ...load, userId: 'another-user' })).rejects.toThrow();
      await expect(
        service.runDataMart({ ...load, projectId: 'another-project' })
      ).rejects.toThrow();
      expect(await db.getRepository(MutationReceipt).count()).toBe(3);
      expect(await db.getRepository(DataMartRun).count()).toBe(1);
      expect(manualRuns.checkStorageAccess).toHaveBeenCalledTimes(1);
    }
  );
  it('rolls back actual run and trigger if receipt completion fails', async () => {
    failCompletion = true;
    await expect(service.runDataMart(load)).rejects.toThrow('receipt completion failed');
    expect(await db.getRepository(DataMartRun).count()).toBe(0);
    expect(await db.getRepository(ConnectorRunTrigger).count()).toBe(0);
    expect(await db.getRepository(MutationReceipt).count()).toBe(0);
  });
  it('rejects changed intent, stale configuration and revoked project roles', async () => {
    await service.runDataMart(load);
    await expect(
      service.runDataMart({
        ...load,
        load: { runType: 'MANUAL_BACKFILL', startDate: '2026-01-01' },
      })
    ).rejects.toThrow(ConflictException);
    allowed = false;
    await expect(service.runDataMart({ ...load, roles: ['viewer'] })).rejects.toThrow(
      ForbiddenException
    );
    allowed = true;
    await expect(
      service.runDataMart({ ...load, operationId: 'new', expectedRevision: 2 })
    ).rejects.toThrow(ConflictException);
    expect(await db.getRepository(DataMartRun).count()).toBe(1);
  });
  it('preserves segmented manual backfill and rejects invalid dates without committed writes', async () => {
    await expect(
      service.runDataMart({
        ...load,
        load: { runType: 'MANUAL_BACKFILL', startDate: '2026-10-01', endDate: '2026-01-01' },
      })
    ).rejects.toThrow();
    expect(await db.getRepository(MutationReceipt).count()).toBe(0);
    const result = await service.runDataMart({
      ...load,
      load: { runType: 'MANUAL_BACKFILL', startDate: '2026-01-01', endDate: '2026-06-01' },
    });
    const stored = await db.getRepository(DataMartRun).findOneByOrFail({ id: result.runId! });
    expect(stored.additionalParams).toMatchObject({
      configurationRevision: 1,
      backfill: { segmentIndex: 1, segmentsTotal: 5 },
    });
  });
  it('completed recovery keeps the original revision after configuration changes; unknown never redispatches', async () => {
    const result = await service.runDataMart(load);
    await db.getRepository(DataMart).update('dm', { revision: 2 });
    expect(await service.runDataMart(load)).toMatchObject({ revision: 1, runId: result.runId });
    expect(await service.getRun({ ...actor, runId: result.runId! })).toMatchObject({
      configurationRevision: 1,
      currentConfigurationRevision: 2,
      configurationCurrent: false,
    });
    await runInTransaction(async () => {
      const reserved = await receipts.reserve(
        db.manager,
        {
          projectId: actor.projectId,
          userId: actor.userId,
          action: 'run_data_mart',
          resourceId: 'dm',
          operationId: 'unknown',
        },
        { expectedRevision: 2, load: { runType: 'INCREMENTAL' } }
      );
      await receipts.markUnknown(db.manager, reserved.receipt.id);
    });
    expect(
      await service.runDataMart({ ...load, expectedRevision: 2, operationId: 'unknown' })
    ).toMatchObject({ outcome: 'unknown' });
    expect(await db.getRepository(DataMartRun).count()).toBe(1);
  });
  it('existing REST schedule writers advance the same revision and reject stale CAS atomically', async () => {
    const repository = db.getRepository(DataMartScheduledTrigger);
    const lookup = new ScheduledTriggerService(repository);
    const mapper = new ScheduledTriggerMapper();
    const access = {
      canAccess: async () => true,
      canAccessStored: async () => true,
      canAccessDmTrigger: async () => true,
    } as any;
    const create = new CreateScheduledTriggerService(
      repository,
      { validate: async () => undefined } as any,
      marts,
      mapper,
      { publishExternal: async () => undefined } as any,
      {} as any,
      access
    );
    const update = new UpdateScheduledTriggerService(
      repository,
      lookup,
      mapper,
      { fetchCreatedByUser: async () => null } as any,
      {} as any,
      {} as any,
      access,
      marts
    );
    const remove = new DeleteScheduledTriggerService(
      repository,
      lookup,
      {} as any,
      {} as any,
      access,
      marts
    );
    const created = await create.run({
      ...actor,
      type: ScheduledTriggerType.CONNECTOR_RUN,
      cronExpression: save.cronExpression,
      timeZone: save.timeZone,
      isActive: true,
    });
    expect((await db.getRepository(DataMart).findOneByOrFail({ id: 'dm' })).revision).toBe(2);
    await expect(
      update.run({
        ...actor,
        id: created.id,
        cronExpression: '0 10 * * *',
        timeZone: 'UTC',
        isActive: false,
        expectedRevision: 1,
      })
    ).rejects.toThrow(ConflictException);
    expect((await repository.findOneByOrFail({ id: created.id })).isActive).toBe(true);
    await update.run({
      ...actor,
      id: created.id,
      cronExpression: '0 10 * * *',
      timeZone: 'UTC',
      isActive: false,
    });
    expect((await db.getRepository(DataMart).findOneByOrFail({ id: 'dm' })).revision).toBe(3);
    await expect(remove.run({ ...actor, id: created.id, expectedRevision: 2 })).rejects.toThrow(
      ConflictException
    );
    await remove.run({ ...actor, id: created.id });
    expect(await repository.count()).toBe(0);
    expect((await db.getRepository(DataMart).findOneByOrFail({ id: 'dm' })).revision).toBe(4);
  });
  it('creates a schedule once, exposes shared revision, updates with CAS and recovers deletion', async () => {
    const created = await service.saveSchedule(save);
    expect(created.revision).toBe(2);
    expect((await service.saveSchedule(save)).resourceId).toBe(created.resourceId);
    expect(await service.listSchedules(actor)).toMatchObject({
      revision: 2,
      revisionAggregate: 'data-mart-configuration',
      schedules: [{ revision: 2, enabled: true }],
    });
    const updated = await service.saveSchedule({
      ...save,
      scheduleId: created.resourceId,
      operationId: undefined,
      expectedRevision: 2,
      enabled: false,
    });
    expect(updated.revision).toBe(3);
    await expect(
      service.saveSchedule({ ...save, scheduleId: created.resourceId, expectedRevision: 2 })
    ).rejects.toThrow(ConflictException);
    const command = {
      ...actor,
      scheduleId: created.resourceId,
      expectedRevision: 3,
      operationId: 'delete-1',
    };
    expect(await service.deleteSchedule(command)).toMatchObject({ deleted: true, revision: 4 });
    expect(await service.deleteSchedule(command)).toMatchObject({ deleted: true, revision: 4 });
    expect(await db.getRepository(DataMartScheduledTrigger).count()).toBe(0);
    expect((await db.getRepository(DataMart).findOneByOrFail({ id: 'dm' })).revision).toBe(4);
  });
  it('rolls back schedule + shared revision + receipt on completion failure', async () => {
    failCompletion = true;
    await expect(service.saveSchedule(save)).rejects.toThrow('receipt completion failed');
    expect(await db.getRepository(DataMartScheduledTrigger).count()).toBe(0);
    expect(await db.getRepository(MutationReceipt).count()).toBe(0);
    expect((await db.getRepository(DataMart).findOneByOrFail({ id: 'dm' })).revision).toBe(1);
  });
  it('configuration edits keep trigger versions monotonic when runtime updates after the configuration snapshot was read', async () => {
    const created = await service.saveSchedule(save);
    const repository = db.getRepository(DataMartScheduledTrigger);
    const snapshot = await repository.findOneByOrFail({ id: created.resourceId });
    const initialVersion = snapshot.version;
    const handler = new ScheduledTriggersHandlerService(repository, {} as any, {} as any);
    const advance = marts.advanceConfigurationRevision.bind(marts);
    marts.advanceConfigurationRevision = async (...args) => {
      snapshot.status = TriggerStatus.PROCESSING;
      expect(await handler.persistRuntimeState(snapshot)).toBe(true);
      return advance(...args);
    };
    await service.saveSchedule({
      ...save,
      scheduleId: snapshot.id,
      expectedRevision: 2,
      enabled: false,
    });
    const current = await repository.findOneByOrFail({ id: snapshot.id });
    expect(current.version).toBe(initialVersion + 2);
    snapshot.onSuccess(new Date());
    expect(await handler.persistRuntimeState(snapshot)).toBe(false);
    expect((await repository.findOneByOrFail({ id: snapshot.id })).isActive).toBe(false);
  });
  it('serializes concurrent schedule configuration edits: exactly one revision wins', async () => {
    const results = await Promise.allSettled([
      service.saveSchedule(save),
      service.saveSchedule({ ...save, operationId: 'schedule-2', cronExpression: '0 10 * * *' }),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(await db.getRepository(DataMartScheduledTrigger).count()).toBe(1);
    expect(await db.getRepository(MutationReceipt).count()).toBe(1);
  });
  it('never mutates a Report schedule or accepts invalid disabled cron/timezone', async () => {
    const created = await service.saveSchedule(save);
    await db
      .getRepository(DataMartScheduledTrigger)
      .update(created.resourceId, { type: ScheduledTriggerType.REPORT_RUN });
    await expect(
      service.saveSchedule({ ...save, scheduleId: created.resourceId, expectedRevision: 2 })
    ).rejects.toThrow('Connector load schedule not found');
    await expect(
      service.deleteSchedule({
        ...actor,
        scheduleId: created.resourceId,
        expectedRevision: 2,
        operationId: 'delete-report',
      })
    ).rejects.toThrow('Connector load schedule not found');
    await expect(
      service.saveSchedule({ ...save, cronExpression: 'invalid', enabled: false })
    ).rejects.toThrow('Invalid cron');
    await expect(
      service.saveSchedule({ ...save, timeZone: 'invalid', enabled: false })
    ).rejects.toThrow('Invalid cron');
    expect(await db.getRepository(DataMartScheduledTrigger).count()).toBe(1);
  });
  it('deletion cancels all live/interrupted work; stale enqueue and next-segment snapshots cannot revive it', async () => {
    const result = await service.runDataMart(load);
    const current = await db.getRepository(DataMart).findOneByOrFail({ id: 'dm' });
    const previous = await db.getRepository(DataMartRun).findOneByOrFail({ id: result.runId! });
    await runInTransaction(async () => {
      await cancelDataMartConnectorWork(db.manager, 'dm', 'project');
      await db.getRepository(DataMart).softDelete('dm');
    });
    expect((await db.getRepository(DataMartRun).findOneByOrFail({ id: previous.id })).status).toBe(
      'CANCELLED'
    );
    expect(
      (await db.getRepository(ConnectorRunTrigger).findOneByOrFail({ id: result.triggerId! }))
        .isActive
    ).toBe(false);
    await expect(engine.run(current, actor.userId, RunType.manual)).rejects.toThrow(
      'Data Mart not found'
    );
    await expect(
      runInTransaction(() =>
        createNextSegmentRun(
          db.getRepository(DataMartRun),
          triggers,
          previous,
          current,
          {
            id: 'chain',
            requestedStart: '2026-01-01',
            requestedEnd: '2026-06-01',
            segmentIndex: 2,
            segmentsTotal: 5,
          },
          { startDate: '2026-02-01', endDate: '2026-03-03' }
        )
      )
    ).rejects.toThrow('Data Mart not found');
    expect(await db.getRepository(DataMartRun).count()).toBe(1);
  });
  it('stale trigger cleanup cannot overwrite a committed connector cancellation', async () => {
    const result = await service.runDataMart(load);
    const stale = await db.getRepository(DataMartRun).findOneByOrFail({ id: result.runId! });
    await runInTransaction(() => cancelDataMartConnectorWork(db.manager, 'dm', 'project'));
    const handler = new ConnectorRunTriggerHandlerService(
      db.getRepository(ConnectorRunTrigger),
      db.getRepository(DataMartRun),
      {} as any,
      {} as any,
      marts,
      { findById: async () => stale } as any,
      {} as any,
      db
    );
    await (handler as any).failDataMartRunSafely(stale.id, new Error('stale worker failure'));
    await (handler as any).failOrphanedRun(stale);
    expect((await db.getRepository(DataMartRun).findOneByOrFail({ id: stale.id })).status).toBe(
      DataMartRunStatus.CANCELLED
    );
  });
  it('cancelled deletion rolls back run status and trigger state too', async () => {
    const result = await service.runDataMart(load);
    await expect(
      runInTransaction(async () => {
        await cancelDataMartConnectorWork(db.manager, 'dm', 'project');
        throw new Error('abort delete');
      })
    ).rejects.toThrow('abort delete');
    expect(
      (await db.getRepository(DataMartRun).findOneByOrFail({ id: result.runId! })).status
    ).toBe('PENDING');
    expect(
      (await db.getRepository(ConnectorRunTrigger).findOneByOrFail({ id: result.triggerId! }))
        .isActive
    ).toBe(true);
  });
  it.each(['delete', 'edit', 'error'] as const)(
    'in-flight scheduler %s cannot restore an obsolete trigger snapshot',
    async change => {
      class Runner extends AbstractTriggerRunnerService<DataMartScheduledTrigger> {
        constructor(handler: ScheduledTriggersHandlerService) {
          super(
            handler,
            { now: () => new Date() } as any,
            {
              isInShutdownMode: () => false,
              registerActiveProcess: () => 'test',
              unregisterActiveProcess: () => undefined,
            } as any
          );
        }
        protected async processTriggers(triggers: DataMartScheduledTrigger[]) {
          for (const trigger of triggers) await this.processTriggerSafely(trigger);
        }
      }
      const created = await service.saveSchedule(save);
      const repository = db.getRepository(DataMartScheduledTrigger);
      const snapshot = await repository.findOneByOrFail({ id: created.resourceId });
      const handler = new ScheduledTriggersHandlerService(repository, {} as any, {} as any);
      handler.handleTrigger = async () => {
        if (change === 'delete')
          await service.deleteSchedule({
            ...actor,
            scheduleId: snapshot.id,
            expectedRevision: 2,
            operationId: 'delete-running',
          });
        else
          await service.saveSchedule({
            ...save,
            scheduleId: snapshot.id,
            expectedRevision: 2,
            enabled: false,
          });
        if (change === 'error') throw new Error('processor failed after edit');
      };
      await new Runner(handler).runTriggers([snapshot]);
      const stored = await repository.findOneBy({ id: snapshot.id });
      if (change === 'delete') expect(stored).toBeNull();
      else {
        expect(stored!.isActive).toBe(false);
        expect(stored!.nextRunTimestamp).toBeNull();
      }
    }
  );
  it.each(['delete', 'cron', 'timezone', 'enabled'] as const)(
    'scheduler runtime persistence never restores stale %s configuration',
    async change => {
      const created = await service.saveSchedule(save);
      const repository = db.getRepository(DataMartScheduledTrigger);
      const snapshot = await repository.findOneByOrFail({ id: created.resourceId });
      const handler = new ScheduledTriggersHandlerService(repository, {} as any, {} as any);
      snapshot.status = TriggerStatus.PROCESSING;
      expect(await handler.persistRuntimeState(snapshot)).toBe(true);
      if (change === 'delete') await repository.delete(snapshot.id);
      else
        await repository.update(
          snapshot.id,
          change === 'cron'
            ? { cronExpression: '0 10 * * *' }
            : change === 'timezone'
              ? { timeZone: 'Europe/Kyiv' }
              : { isActive: false, nextRunTimestamp: null }
        );
      snapshot.onSuccess(new Date());
      expect(await handler.persistRuntimeState(snapshot)).toBe(false);
      const stored = await repository.findOneBy({ id: snapshot.id });
      if (change === 'delete') expect(stored).toBeNull();
      if (change === 'cron') expect(stored!.cronExpression).toBe('0 10 * * *');
      if (change === 'timezone') expect(stored!.timeZone).toBe('Europe/Kyiv');
      if (change === 'enabled') expect(stored!.isActive).toBe(false);
    }
  );
});
