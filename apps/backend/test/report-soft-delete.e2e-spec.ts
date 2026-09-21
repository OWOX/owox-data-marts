import { INestApplication } from '@nestjs/common';
import type { IdpProvider, Payload } from '@owox/idp-protocol';
import { DataSource } from 'typeorm';
import * as supertest from 'supertest';
import {
  AUTH_HEADER,
  closeTestApp,
  createTestApp,
  EMAIL_REPORT_DESTINATION_CONFIG,
  ReportBuilder,
  ScheduledTriggerBuilder,
  setupReportPrerequisites,
} from '@owox/test-utils';
import { TriggerStatus } from '../src/common/scheduler/shared/entities/trigger-status';
import { RunType } from '../src/common/scheduler/shared/types';
import { DirectTriggerRunnerService } from '../src/common/scheduler/services/runners/direct-trigger-runner.service';
import { SystemTimeService } from '../src/common/scheduler/services/system-time.service';
import { GracefulShutdownService } from '../src/common/scheduler/services/graceful-shutdown.service';
import { DataDestinationType } from '../src/data-marts/data-destination-types/enums/data-destination-type.enum';
import { DataStorageType } from '../src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { ReportDataDescription } from '../src/data-marts/dto/domain/report-data-description.dto';
import { ReportDataBatch } from '../src/data-marts/dto/domain/report-data-batch.dto';
import { CachedReaderData } from '../src/data-marts/dto/domain/cached-reader-data.dto';
import { DataMartScheduledTrigger } from '../src/data-marts/entities/data-mart-scheduled-trigger.entity';
import { DataMartRun } from '../src/data-marts/entities/data-mart-run.entity';
import { ReportRunTrigger } from '../src/data-marts/entities/report-run-trigger.entity';
import { DataStorage } from '../src/data-marts/entities/data-storage.entity';
import { ReportDataCache } from '../src/data-marts/entities/report-data-cache.entity';
import { Report } from '../src/data-marts/entities/report.entity';
import { ReportOwner } from '../src/data-marts/entities/report-owner.entity';
import { ReportRunStatus } from '../src/data-marts/enums/report-run-status.enum';
import { DataMartRunStatus } from '../src/data-marts/enums/data-mart-run-status.enum';
import { DataMartRunType } from '../src/data-marts/enums/data-mart-run-type.enum';
import { ScheduledTriggerType } from '../src/data-marts/scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import { ScheduledReportRunConfigType } from '../src/data-marts/scheduled-trigger-types/scheduled-report-run/schemas/scheduled-report-run-config.schema';
import { LegacyDataStorageService } from '../src/data-marts/services/legacy-data-marts/legacy-data-storage.service';
import { ReportDataCacheService } from '../src/data-marts/services/report-data-cache.service';
import { ReportRunService } from '../src/data-marts/services/report-run.service';
import { ReportRunTriggerHandlerService } from '../src/data-marts/services/report-run-trigger-handler.service';
import { resolveBlendableSchemaAccessor } from '../src/data-marts/services/blendable-schema.service';
import { MoveLegacyDataStorageService } from '../src/data-marts/use-cases/legacy-data-marts/move-legacy-data-storage.service';
import { IdpProjectionsFacade } from '../src/idp/facades/idp-projections.facade';
import { ProjectMemberDto } from '../src/idp/dto/domain/project-member.dto';

describe('Report soft deletion (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let dataSource: DataSource;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  async function createReport(
    type:
      | DataDestinationType.LOOKER_STUDIO
      | DataDestinationType.EMAIL = DataDestinationType.LOOKER_STUDIO
  ) {
    const prerequisites = await setupReportPrerequisites(agent, type);
    const payload = new ReportBuilder()
      .withDataMartId(prerequisites.dataMartId)
      .withDataDestinationId(prerequisites.dataDestinationId)
      .withDestinationConfig(
        type === DataDestinationType.EMAIL
          ? EMAIL_REPORT_DESTINATION_CONFIG
          : { type: 'looker-studio-config', cacheLifetime: 7200 }
      )
      .build();
    const response = await agent.post('/api/reports').set(AUTH_HEADER).send(payload);
    expect(response.status).toBe(201);
    const report = await dataSource.getRepository(Report).findOneOrFail({
      where: { id: response.body.id },
      relations: ['owners'],
    });
    return { ...prerequisites, payload, report };
  }

  async function cacheReport(report: Report) {
    await dataSource.getRepository(ReportDataCache).save({
      report,
      dataDescription: new ReportDataDescription([], 0),
      readerState: null,
      storageType: DataStorageType.GOOGLE_BIGQUERY,
      expiresAt: new Date(Date.now() + 60_000),
    });
  }

  it('keeps deleted Looker settings until re-enable, then resets them while retaining identity and run state', async () => {
    const { report, payload, dataMartId, dataDestinationId } = await createReport();
    const repository = dataSource.getRepository(Report);
    await repository.update(report.id, {
      runsCount: 7,
      lastRunStatus: ReportRunStatus.SUCCESS,
    });

    for (let cycle = 0; cycle < 2; cycle++) {
      await repository.update(report.id, {
        destinationConfig: { type: 'looker-studio-config', cacheLifetime: 7200 },
        columnConfig: ['old_column'],
        filterConfig: [{ column: 'old_column', operator: 'eq', value: 'old' }],
        sortConfig: [{ column: 'old_column', direction: 'desc' }],
        limitConfig: 25,
        aggregationConfig: [{ column: 'old_column', function: 'COUNT' }],
        dateTruncConfig: [{ column: 'old_date', unit: 'MONTH' }],
        uniqueCountConfig: true,
      });
      const owners = dataSource.getRepository(ReportOwner);
      await owners.delete({ reportId: report.id });
      await owners.save({ reportId: report.id, userId: 'former-owner' });
      await cacheReport(report);
      await agent.delete(`/api/reports/${report.id}`).set(AUTH_HEADER).expect(200);

      const deleted = await repository.findOne({
        where: { id: report.id },
        withDeleted: true,
        relations: ['owners'],
      });
      expect(deleted).toMatchObject({
        deletedAt: expect.any(Date),
        destinationConfig: { cacheLifetime: 7200 },
        columnConfig: ['old_column'],
        limitConfig: 25,
        runsCount: 7,
      });
      expect(deleted?.ownerIds).toEqual(['former-owner']);
      expect(
        await dataSource
          .getRepository(ReportDataCache)
          .count({ where: { report: { id: report.id } }, withDeleted: true })
      ).toBe(0);
      await agent.get(`/api/reports/${report.id}`).set(AUTH_HEADER).expect(404);
      await agent.delete(`/api/reports/${report.id}`).set(AUTH_HEADER).expect(404);
      for (const path of ['/api/reports', `/api/reports/data-mart/${dataMartId}`]) {
        const response = await agent.get(path).set(AUTH_HEADER).expect(200);
        expect(response.body.map((item: { id: string }) => item.id)).not.toContain(report.id);
      }
      // A cascading softRemove would also hide these parents.
      await agent.get(`/api/data-marts/${dataMartId}`).set(AUTH_HEADER).expect(200);
      await agent.get(`/api/data-destinations/${dataDestinationId}`).set(AUTH_HEADER).expect(200);

      const response = await agent
        .post('/api/reports')
        .set(AUTH_HEADER)
        .send({
          ...payload,
          title: 'Toggle default',
          // The toggle omits owners; explicit API input still follows normal create rules.
          ...(cycle === 1 ? { ownerIds: [] } : {}),
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 300 },
        });
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        id: report.id,
        title: report.title,
        destinationConfig: { cacheLifetime: 300 },
        columnConfig: null,
        filterConfig: null,
        sortConfig: null,
        limitConfig: null,
        aggregationConfig: null,
        dateTruncConfig: null,
        uniqueCountConfig: null,
      });
      const restored = await repository.findOneOrFail({
        where: { id: report.id },
        relations: ['owners'],
      });
      expect(restored).toMatchObject({
        deletedAt: null,
        createdById: report.createdById,
        createdAt: report.createdAt,
        runsCount: 7,
        lastRunStatus: ReportRunStatus.SUCCESS,
      });
      expect(restored.ownerIds).toEqual(cycle === 0 ? ['0'] : []);
    }

    expect(await repository.count({ where: { id: report.id }, withDeleted: true })).toBe(1);
    await agent.post('/api/reports').set(AUTH_HEADER).send(payload).expect(400);
  });

  it('re-enables with create permissions and uses the new caller for Looker reads', async () => {
    const { report, payload, dataMartId, dataDestinationId } = await createReport();
    await agent.delete(`/api/reports/${report.id}`).set(AUTH_HEADER).expect(200);
    await agent
      .put(`/api/data-marts/${dataMartId}/availability`)
      .set(AUTH_HEADER)
      .send({ availableForReporting: true, availableForMaintenance: false })
      .expect(204);

    const idp = app.getHttpAdapter().getInstance().get('idp') as IdpProvider;
    const introspect = idp.introspectToken.bind(idp);
    const caller: Payload = {
      userId: '1',
      email: 'editor@localhost',
      fullName: 'Editor',
      roles: ['editor'],
      projectId: '0',
    };
    const auth = { 'x-owox-authorization': 'reenable-token' };
    const authSpy = jest
      .spyOn(idp, 'introspectToken')
      .mockImplementation(token =>
        token === 'reenable-token' ? Promise.resolve(caller) : introspect(token)
      );
    const projections = app.get(IdpProjectionsFacade);
    const members = await projections.getProjectMembers('0');
    const membersSpy = jest
      .spyOn(projections, 'getProjectMembers')
      .mockResolvedValue([
        ...members,
        new ProjectMemberDto('1', 'editor@localhost', 'Editor', undefined, 'editor', true, false),
      ]);
    // The old author has left: actual Looker reads must resolve the new caller's identity.
    const strictMembersSpy = jest
      .spyOn(projections, 'getProjectMembersOrThrow')
      .mockResolvedValue([
        new ProjectMemberDto('1', 'editor@localhost', 'Editor', undefined, 'editor', true, false),
      ]);
    const repository = dataSource.getRepository(Report);
    try {
      // Parent access is still required even though former report ownership is not.
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: false, availableForMaintenance: false })
        .expect(204);
      await agent.post('/api/reports').set(auth).send(payload).expect(403);
      await agent
        .put(`/api/data-destinations/${dataDestinationId}/availability`)
        .set(AUTH_HEADER)
        .send({ availableForUse: true, availableForMaintenance: false })
        .expect(204);

      // A failed owner validation must roll back restoration and configuration changes.
      await agent
        .post('/api/reports')
        .set(auth)
        .send({
          ...payload,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 900 },
          limitConfig: 10,
          ownerIds: ['non-member'],
        })
        .expect(400);
      const tombstone = await repository.findOneOrFail({
        where: { id: report.id },
        withDeleted: true,
        relations: ['owners'],
      });
      expect(tombstone).toMatchObject({
        deletedAt: expect.any(Date),
        destinationConfig: { cacheLifetime: 7200 },
        limitConfig: null,
        createdById: '0',
      });
      expect(tombstone.ownerIds).toEqual(['0']);

      const response = await agent
        .post('/api/reports')
        .set(auth)
        .send({
          ...payload,
          destinationConfig: { type: 'looker-studio-config', cacheLifetime: 900 },
          limitConfig: 10,
        })
        .expect(201);
      expect(response.body).toMatchObject({
        id: report.id,
        destinationConfig: { cacheLifetime: 900 },
        limitConfig: 10,
        canEditConfig: true,
      });
      const reenabled = await repository.findOneOrFail({
        where: { id: report.id },
        relations: ['owners'],
      });
      expect(reenabled.ownerIds).toEqual(['1']);
      await expect(
        resolveBlendableSchemaAccessor(projections, '0', reenabled.createdById)
      ).resolves.toEqual({ userId: '1', roles: ['editor'] });
      expect(reenabled.createdById).toBe('1');
      expect(reenabled.createdAt).toEqual(report.createdAt);
    } finally {
      authSpy.mockRestore();
      membersSpy.mockRestore();
      strictMembersSpy.mockRestore();
    }
  });

  it('retains a deleted push report and owners, removes schedules, and creates a new report on add', async () => {
    const { report, payload, dataMartId } = await createReport(DataDestinationType.EMAIL);
    const trigger = await agent
      .post(`/api/data-marts/${dataMartId}/scheduled-triggers`)
      .set(AUTH_HEADER)
      .send(
        new ScheduledTriggerBuilder()
          .withType(ScheduledTriggerType.REPORT_RUN)
          .withIsActive(false)
          .withTriggerConfig({ type: ScheduledReportRunConfigType, reportId: report.id })
          .build()
      )
      .expect(201);

    await agent.delete(`/api/reports/${report.id}`).set(AUTH_HEADER).expect(200);
    const deleted = await dataSource.getRepository(Report).findOneOrFail({
      where: { id: report.id },
      withDeleted: true,
      relations: ['owners'],
    });
    expect(deleted.deletedAt).toEqual(expect.any(Date));
    expect(deleted.ownerIds).toEqual(report.ownerIds);
    expect(
      await dataSource.getRepository(DataMartScheduledTrigger).findOneBy({ id: trigger.body.id })
    ).toBeNull();

    const next = await agent.post('/api/reports').set(AUTH_HEADER).send(payload).expect(201);
    expect(next.body.id).not.toBe(report.id);
  });

  it.each(['report', 'data-mart'])(
    'cancels a queued run at execution time after deleting its %s',
    async target => {
      const { report, dataMartId } = await createReport(DataDestinationType.EMAIL);
      const runs = dataSource.getRepository(DataMartRun);
      const triggers = dataSource.getRepository(ReportRunTrigger);
      const run = await runs.save({
        dataMartId,
        reportId: report.id,
        type: DataMartRunType.EMAIL,
        status: DataMartRunStatus.PENDING,
        runType: RunType.scheduled,
        createdById: report.createdById,
      });
      const trigger = await triggers.save(
        triggers.create({
          reportId: report.id,
          dataMartRunId: run.id,
          projectId: report.dataMart.projectId,
          createdById: report.createdById,
          runType: run.runType,
          status: TriggerStatus.READY,
          isActive: true,
        })
      );
      const path =
        target === 'report' ? `/api/reports/${report.id}` : `/api/data-marts/${dataMartId}`;
      await agent.delete(path).set(AUTH_HEADER).expect(200);
      expect(await runs.findOneByOrFail({ id: run.id })).toMatchObject({
        status: DataMartRunStatus.PENDING,
      });

      const startSpy = jest.spyOn(app.get(ReportRunService), 'markAsStarted');
      try {
        const runner = new DirectTriggerRunnerService(
          app.get(ReportRunTriggerHandlerService),
          app.get(SystemTimeService),
          app.get(GracefulShutdownService)
        );
        await runner.runTriggers([trigger]);
        expect(startSpy).not.toHaveBeenCalled();
        expect(await runs.findOneByOrFail({ id: run.id })).toMatchObject({
          status: DataMartRunStatus.CANCELLED,
          finishedAt: expect.any(Date),
        });
        expect(await triggers.findOneByOrFail({ id: trigger.id })).toMatchObject({
          status: TriggerStatus.SUCCESS,
        });
      } finally {
        startSpy.mockRestore();
      }
    }
  );

  it('preserves an in-flight run and its result after report deletion', async () => {
    const { report, dataMartId } = await createReport(DataDestinationType.EMAIL);
    const runs = dataSource.getRepository(DataMartRun);
    const run = await runs.save({
      dataMartId,
      reportId: report.id,
      type: DataMartRunType.EMAIL,
      status: DataMartRunStatus.RUNNING,
      runType: RunType.manual,
      createdById: report.createdById,
    });
    const runService = app.get(ReportRunService);
    const reportRun = await runService.loadByDataMartRunId(run.id);
    expect(reportRun).not.toBeNull();

    await agent.delete(`/api/reports/${report.id}`).set(AUTH_HEADER).expect(200);
    expect(await runs.findOneByOrFail({ id: run.id })).toMatchObject({
      status: DataMartRunStatus.RUNNING,
    });
    reportRun!.markAsSuccess();
    await runService.finish(reportRun!, { logs: ['Completed after deletion'] });

    expect(await runs.findOneByOrFail({ id: run.id })).toMatchObject({
      status: DataMartRunStatus.SUCCESS,
      logs: ['Completed after deletion'],
      finishedAt: expect.any(Date),
    });
    expect(
      await dataSource.getRepository(Report).findOne({
        where: { id: report.id },
        withDeleted: true,
      })
    ).toMatchObject({ deletedAt: expect.any(Date), lastRunStatus: ReportRunStatus.SUCCESS });
  });

  it('soft-deletes reports when their Data Mart is deleted and clears their cache', async () => {
    const { report, dataMartId, dataDestinationId, payload } = await createReport();
    await cacheReport(report);

    await agent.delete(`/api/data-marts/${dataMartId}`).set(AUTH_HEADER).expect(200);

    const deleted = await dataSource.getRepository(Report).findOneOrFail({
      where: { id: report.id },
      withDeleted: true,
    });
    expect(deleted.deletedAt).toEqual(expect.any(Date));
    expect(
      await dataSource
        .getRepository(ReportDataCache)
        .count({ where: { report: { id: report.id } }, withDeleted: true })
    ).toBe(0);
    await agent.post('/api/reports').set(AUTH_HEADER).send(payload).expect(404);
    // Soft-deleted reports must not block deleting their destination.
    await agent.delete(`/api/data-destinations/${dataDestinationId}`).set(AUTH_HEADER).expect(200);
  });

  it('does not resurrect a report when an editor saves an entity loaded before deletion', async () => {
    const { report } = await createReport();
    await agent.delete(`/api/reports/${report.id}`).set(AUTH_HEADER).expect(200);

    report.title = 'Saved from a stale editor';
    await dataSource.getRepository(Report).save(report);

    const deleted = await dataSource.getRepository(Report).findOneOrFail({
      where: { id: report.id },
      withDeleted: true,
    });
    expect(deleted.deletedAt).toEqual(expect.any(Date));
    await agent.get(`/api/reports/${report.id}`).set(AUTH_HEADER).expect(404);
  });

  it.each(['invalidateByReportId', 'invalidateByDataMartId', 'cleanupExpiredCache'] as const)(
    '%s keeps a concurrently published cache entry available for later finalization',
    async operation => {
      const { report, dataMartId } = await createReport();
      const repository = dataSource.getRepository(ReportDataCache);
      const cache = {
        report,
        dataDescription: new ReportDataDescription([], 0),
        readerState: {
          type: DataStorageType.AWS_ATHENA as const,
          outputBucket: 'test-results',
          outputPrefix: 'query-results/',
        },
        storageType: DataStorageType.AWS_ATHENA,
        expiresAt: new Date(0),
      };
      const initialEntry = await repository.save({ ...cache });
      let concurrentEntryId: string;
      const reader = {
        prepareReportData: async () => new ReportDataDescription([], 0),
        initFromState: async () => undefined,
        finalize: jest.fn().mockImplementationOnce(async () => {
          // A query can publish its cache while the selected entries are being finalized.
          const concurrentEntry = await repository.save({
            ...cache,
            readerState: { ...cache.readerState, outputPrefix: 'concurrent-query-results/' },
            expiresAt:
              operation === 'invalidateByReportId'
                ? new Date(Date.now() + 60_000)
                : cache.expiresAt,
          });
          concurrentEntryId = concurrentEntry.id;
        }),
      };
      const cacheService = new ReportDataCacheService(
        repository,
        { resolve: async () => reader } as never,
        {} as never,
        {} as never
      );

      await cacheService[operation](
        operation === 'invalidateByDataMartId' ? dataMartId : report.id
      );

      expect(await repository.findOneBy({ id: initialEntry.id })).toBeNull();
      const pendingEntry = await repository.findOneByOrFail({ id: concurrentEntryId! });
      expect(pendingEntry.expiresAt.getTime()).toBeLessThan(Date.now());
      expect(reader.finalize).toHaveBeenCalledTimes(1);

      await cacheService.cleanupExpiredCache();

      expect(await repository.findOneBy({ id: concurrentEntryId! })).toBeNull();
      expect(reader.finalize).toHaveBeenCalledTimes(2);
    }
  );

  it.each([false, true])(
    'does not publish an in-flight cache after deletion (re-enabled: %s)',
    async reenable => {
      const { report, payload } = await createReport();
      let releasePreparation!: () => void;
      let markPreparationStarted!: () => void;
      const preparationStarted = new Promise<void>(resolve => {
        markPreparationStarted = resolve;
      });
      const preparationReleased = new Promise<void>(resolve => {
        releasePreparation = resolve;
      });
      const reader = {
        prepareReportData: async () => {
          markPreparationStarted();
          await preparationReleased;
          return new ReportDataDescription([], 0);
        },
        readReportDataBatch: async () => new ReportDataBatch([], null),
        getState: () => null,
      };
      const repository = dataSource.getRepository(ReportDataCache);
      const freshReader = {
        ...reader,
        prepareReportData: async () => new ReportDataDescription([], 0),
      };
      const resolveReader = jest.fn().mockResolvedValueOnce(reader).mockResolvedValue(freshReader);
      // Use a separate service instance to also cover readers running in another process.
      const cacheService = new ReportDataCacheService(
        repository,
        { resolve: resolveReader } as never,
        { resolveBlendingDecision: async () => ({ needsBlending: false }) } as never,
        {} as never
      );
      const operation = cacheService.getOrCreateCachedReader(report, {
        userId: '0',
        roles: ['admin'],
      });
      let restoredOperation: Promise<CachedReaderData> | undefined;
      await preparationStarted;
      try {
        await agent.delete(`/api/reports/${report.id}`).set(AUTH_HEADER).expect(200);
        if (reenable) {
          await agent.post('/api/reports').set(AUTH_HEADER).send(payload).expect(201);
          const restoredReport = await dataSource
            .getRepository(Report)
            .findOneByOrFail({ id: report.id });
          restoredOperation = cacheService.getOrCreateCachedReader(restoredReport, {
            userId: '0',
            roles: ['admin'],
          });
        }
      } finally {
        releasePreparation();
      }
      await operation;
      if (restoredOperation) {
        expect((await restoredOperation).reader).toBe(freshReader);
      }
      expect(
        await repository.count({ where: { report: { id: report.id } }, withDeleted: true })
      ).toBe(reenable ? 1 : 0);
    }
  );

  it('retains report tombstones when legacy storage moves between projects', async () => {
    const { report, storageId } = await createReport();
    await cacheReport(report);
    const storage = await dataSource.getRepository(DataStorage).findOneByOrFail({ id: storageId });
    const permission = jest
      .spyOn(app.get(LegacyDataStorageService), 'validateSyncPermissionForProject')
      .mockReturnValue(undefined);
    try {
      await app.get(MoveLegacyDataStorageService).run(storage, 'moved-project');
    } finally {
      permission.mockRestore();
    }

    const deleted = await dataSource.getRepository(Report).findOneOrFail({
      where: { id: report.id },
      withDeleted: true,
    });
    expect(deleted.deletedAt).toEqual(expect.any(Date));
    expect(
      await dataSource
        .getRepository(ReportDataCache)
        .count({ where: { report: { id: report.id } }, withDeleted: true })
    ).toBe(0);
  });
});
