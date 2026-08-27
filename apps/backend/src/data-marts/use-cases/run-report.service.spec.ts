jest.mock('../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

jest.mock('../report-run-logging/log-blended-sql', () => ({
  logBlendedSqlIfNeeded: jest.fn(),
}));

import { logBlendedSqlIfNeeded } from '../report-run-logging/log-blended-sql';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { ReportDataBatch } from '../dto/domain/report-data-batch.dto';
import { ReportDataDescription } from '../dto/domain/report-data-description.dto';
import { ReportDataHeader } from '../dto/domain/report-data-header.dto';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataDestination } from '../entities/data-destination.entity';
import { Report } from '../entities/report.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { ProjectBlockedReason } from '../enums/project-blocked-reason.enum';
import { ProjectOperationBlockedException } from '../../common/exceptions/project-operation-blocked.exception';
import { ReportRunStatus } from '../enums/report-run-status.enum';
import { RunKind } from '../services/project-billing/project-billing.service';
import { ReportExecutionPolicyResolver } from './report-execution-policy.resolver';
import { RunReportService } from './run-report.service';
import { RunType } from '../../common/scheduler/shared/types';
import { ReportRun } from '../models/report-run.model';

jest.mock('../data-destination-types/data-destination-providers', () => ({
  DATA_DESTINATION_REPORT_WRITER_RESOLVER: 'DATA_DESTINATION_REPORT_WRITER_RESOLVER',
}));

jest.mock('../data-storage-types/data-storage-providers', () => ({
  DATA_STORAGE_REPORT_READER_RESOLVER: 'DATA_STORAGE_REPORT_READER_RESOLVER',
}));

describe('RunReportService', () => {
  const createService = () => {
    const reportReaderResolver = {
      resolve: jest.fn(),
    };
    const reportWriterResolver = {
      resolve: jest.fn(),
    };
    const blendedReportDataService = {
      // Default: no columnConfig -> no blending, no filter.
      resolveBlendingDecision: jest.fn().mockResolvedValue({ needsBlending: false }),
    };
    const dataMartService = {
      actualizeSchemaInEntity: jest.fn().mockResolvedValue(undefined),
      saveActualizedSchema: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
      updateDataLastUpdated: jest.fn().mockResolvedValue(true),
    };
    const sourceDataLastUpdatedService = {
      resolveForSql: jest.fn().mockResolvedValue({
        dataLastUpdatedAt: null,
        computedAt: '2026-07-31T00:00:00.000Z',
        coverage: 'unavailable',
        sources: [],
      }),
      resolveForDefinition: jest.fn().mockResolvedValue({
        dataLastUpdatedAt: null,
        computedAt: '2026-07-31T00:00:00.000Z',
        coverage: 'unavailable',
        sources: [],
      }),
    };
    const reportRunService = {
      createPending: jest.fn(),
      loadByDataMartRunId: jest.fn(),
      markAsStarted: jest.fn().mockResolvedValue(undefined),
      finish: jest.fn().mockResolvedValue(undefined),
    };
    const reportRunTriggerService = {
      createTrigger: jest.fn().mockResolvedValue(undefined),
    };
    const reportAccessService = {
      checkOperateAccess: jest.fn().mockResolvedValue(undefined),
      checkMutateAccess: jest.fn().mockResolvedValue(undefined),
    };
    const gracefulShutdownService = {
      isInShutdownMode: jest.fn().mockReturnValue(false),
      registerActiveProcess: jest.fn(),
      unregisterActiveProcess: jest.fn(),
    };
    const systemTimeService = {
      now: jest.fn().mockReturnValue(new Date('2026-06-01T10:00:00.000Z')),
    };
    const projectBilling = {
      verifyCanPerformOperations: jest.fn().mockResolvedValue(undefined),
      registerSheetsReportRunConsumption: jest.fn().mockResolvedValue(undefined),
      registerEmailBasedReportRunConsumption: jest.fn().mockResolvedValue(undefined),
    };
    const idpProjectionsFacade = {
      getProjectMemberOrThrow: jest.fn().mockResolvedValue({ role: 'admin' }),
    };

    const reportSqlComposerService = {
      compose: jest.fn().mockResolvedValue({ sql: 'SELECT 1' }),
      inlineStaticSql: jest.fn().mockReturnValue('SELECT 1'),
    };

    const service = new RunReportService(
      reportReaderResolver as never,
      reportWriterResolver as never,
      dataMartService as never,
      gracefulShutdownService as never,
      systemTimeService as never,
      reportRunService as never,
      projectBilling as never,
      new ReportExecutionPolicyResolver(),
      reportRunTriggerService as never,
      reportAccessService as never,
      blendedReportDataService as never,
      reportSqlComposerService as never,
      idpProjectionsFacade as never,
      sourceDataLastUpdatedService as never
    );

    return {
      service,
      reportReaderResolver,
      reportWriterResolver,
      projectBilling,
      idpProjectionsFacade,
      blendedReportDataService,
      dataMartService,
      sourceDataLastUpdatedService,
      reportRunService,
      reportRunTriggerService,
      reportAccessService,
      gracefulShutdownService,
      reportSqlComposerService,
    };
  };

  const createReport = (destinationType: DataDestinationType): Report => {
    const report = new Report();
    report.id = 'report-1';
    report.title = 'Report';
    report.createdById = 'user-1';
    report.dataMart = {
      id: 'data-mart-1',
      projectId: 'project-1',
      storage: {
        type: DataStorageType.GOOGLE_BIGQUERY,
      },
    } as never;
    const dataDestination = new DataDestination();
    dataDestination.type = destinationType;
    report.dataDestination = dataDestination;
    return report;
  };

  const createDataMartRun = (report: Report): DataMartRun => {
    const dataMartRun = new DataMartRun();
    dataMartRun.id = 'data-mart-run-1';
    dataMartRun.dataMartId = report.dataMart.id;
    dataMartRun.reportId = report.id;
    dataMartRun.status = DataMartRunStatus.PENDING;
    dataMartRun.type = DataMartRunType.GOOGLE_SHEETS_EXPORT;
    dataMartRun.createdById = report.createdById;
    dataMartRun.runType = RunType.manual;
    dataMartRun.definitionRun = {} as never;
    return dataMartRun;
  };

  const createReader = () => ({
    type: DataStorageType.GOOGLE_BIGQUERY,
    prepareReportData: jest
      .fn()
      .mockResolvedValue(new ReportDataDescription([new ReportDataHeader('col_1')])),
    readReportDataBatch: jest.fn(),
    finalize: jest.fn().mockResolvedValue(undefined),
    getState: jest.fn(),
    initFromState: jest.fn(),
  });

  const createWriter = (destinationType: DataDestinationType) => ({
    type: destinationType,
    setExecutionContext: jest.fn(),
    prepareToWriteReport: jest.fn().mockResolvedValue(undefined),
    writeReportDataBatch: jest.fn().mockResolvedValue(undefined),
    finalize: jest.fn().mockResolvedValue(undefined),
  });

  it('limits email-based report reads to 101 rows and truncates overflowing batch', async () => {
    const { service, reportReaderResolver, reportWriterResolver } = createService();
    const report = createReport(DataDestinationType.EMAIL);
    const reader = createReader();
    const writer = createWriter(DataDestinationType.EMAIL);

    reader.readReportDataBatch
      .mockResolvedValueOnce(
        new ReportDataBatch(
          Array.from({ length: 70 }, (_, i) => [i]),
          'b2'
        )
      )
      .mockResolvedValueOnce(
        new ReportDataBatch(
          Array.from({ length: 70 }, (_, i) => [i + 70]),
          'b3'
        )
      );

    reportReaderResolver.resolve.mockResolvedValue(reader);
    reportWriterResolver.resolve.mockResolvedValue(writer);

    await (
      service as unknown as {
        executeReport: (
          report: Report,
          accessor: { userId: string; roles: string[] }
        ) => Promise<void>;
      }
    ).executeReport(report, { userId: 'user-1', roles: ['admin'] });

    expect(reader.readReportDataBatch).toHaveBeenNthCalledWith(1, undefined, 101);
    expect(reader.readReportDataBatch).toHaveBeenNthCalledWith(2, 'b2', 31);
    expect(reader.readReportDataBatch).toHaveBeenCalledTimes(2);

    expect(writer.writeReportDataBatch).toHaveBeenCalledTimes(2);
    const firstBatch = writer.writeReportDataBatch.mock.calls[0][0] as ReportDataBatch;
    const secondBatch = writer.writeReportDataBatch.mock.calls[1][0] as ReportDataBatch;
    expect(firstBatch.dataRows).toHaveLength(70);
    expect(firstBatch.nextDataBatchId).toBe('b2');
    expect(secondBatch.dataRows).toHaveLength(30);
    expect(secondBatch.nextDataBatchId).toBe('b3');
    expect(writer.finalize).toHaveBeenCalledWith(undefined, {
      mainRowsTruncationInfo: {
        rowsLimit: 100,
        hasMoreRowsThanLimit: true,
      },
    });
    expect(reader.finalize).toHaveBeenCalled();
  });

  it('forwards blending decision and run logger to logBlendedSqlIfNeeded helper', async () => {
    const { service, reportReaderResolver, reportWriterResolver, blendedReportDataService } =
      createService();
    const report = createReport(DataDestinationType.GOOGLE_SHEETS);
    const reader = createReader();
    const writer = createWriter(DataDestinationType.GOOGLE_SHEETS);

    reader.readReportDataBatch.mockResolvedValue(new ReportDataBatch([], undefined));

    reportReaderResolver.resolve.mockResolvedValue(reader);
    reportWriterResolver.resolve.mockResolvedValue(writer);

    const decision = { needsBlending: true, blendedSql: 'SELECT 1' };
    blendedReportDataService.resolveBlendingDecision.mockResolvedValue(decision);

    (logBlendedSqlIfNeeded as jest.Mock).mockReset();

    const mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      asArrays: jest.fn().mockReturnValue({ logs: [], errors: [] }),
    };

    await (
      service as unknown as {
        executeReport: (
          report: Report,
          accessor: { userId: string; roles: string[] },
          signal?: AbortSignal,
          logger?: unknown
        ) => Promise<void>;
      }
    ).executeReport(report, { userId: 'user-1', roles: ['admin'] }, undefined, mockLogger);

    expect(logBlendedSqlIfNeeded).toHaveBeenCalledWith(decision, mockLogger);
  });

  it('registers Google Sheets consumption only after final report success is persisted', async () => {
    const {
      service,
      reportReaderResolver,
      reportWriterResolver,
      reportRunService,
      projectBilling,
      idpProjectionsFacade,
      dataMartService,
    } = createService();
    const report = createReport(DataDestinationType.GOOGLE_SHEETS);
    const reader = createReader();
    const writer = createWriter(DataDestinationType.GOOGLE_SHEETS);
    const reportRun = ReportRun.create(report, createDataMartRun(report));

    reader.readReportDataBatch.mockResolvedValue(new ReportDataBatch([], null));
    writer.finalize.mockResolvedValue({
      consumption: {
        googleSheets: {
          googleSheetsDocumentTitle: 'Test Spreadsheet',
          googleSheetsListTitle: 'Sheet1',
        },
      },
    });
    reportReaderResolver.resolve.mockResolvedValue(reader);
    reportWriterResolver.resolve.mockResolvedValue(writer);
    reportRunService.loadByDataMartRunId.mockResolvedValue(reportRun);

    await service.executeExistingRun('data-mart-run-1', 'project-1', 'user-1');

    expect(reportRunService.finish).toHaveBeenCalled();
    expect(projectBilling.verifyCanPerformOperations).toHaveBeenCalledWith(
      'project-1',
      RunKind.SHEETS_REPORT_RUN
    );
    expect(projectBilling.verifyCanPerformOperations.mock.invocationCallOrder[0]).toBeLessThan(
      reportReaderResolver.resolve.mock.invocationCallOrder[0]
    );
    expect(projectBilling.verifyCanPerformOperations.mock.invocationCallOrder[0]).toBeLessThan(
      idpProjectionsFacade.getProjectMemberOrThrow.mock.invocationCallOrder[0]
    );
    expect(projectBilling.verifyCanPerformOperations.mock.invocationCallOrder[0]).toBeLessThan(
      dataMartService.actualizeSchemaInEntity.mock.invocationCallOrder[0]
    );
    expect(projectBilling.verifyCanPerformOperations.mock.invocationCallOrder[0]).toBeLessThan(
      reportRunService.markAsStarted.mock.invocationCallOrder[0]
    );
    expect(projectBilling.registerSheetsReportRunConsumption).toHaveBeenCalledWith(report, {
      googleSheetsDocumentTitle: 'Test Spreadsheet',
      googleSheetsListTitle: 'Sheet1',
    });
    expect(reportRunService.finish.mock.invocationCallOrder[0]).toBeLessThan(
      projectBilling.registerSheetsReportRunConsumption.mock.invocationCallOrder[0]
    );
  });

  it.each([
    DataDestinationType.EMAIL,
    DataDestinationType.SLACK,
    DataDestinationType.MS_TEAMS,
    DataDestinationType.GOOGLE_CHAT,
  ])(
    'registers %s consumption only after final report success is persisted',
    async destinationType => {
      const {
        service,
        reportReaderResolver,
        reportWriterResolver,
        reportRunService,
        projectBilling,
      } = createService();
      const report = createReport(destinationType);
      const reader = createReader();
      const writer = createWriter(destinationType);
      const reportRun = ReportRun.create(report, createDataMartRun(report));

      reader.readReportDataBatch.mockResolvedValue(new ReportDataBatch([], null));
      reportReaderResolver.resolve.mockResolvedValue(reader);
      reportWriterResolver.resolve.mockResolvedValue(writer);
      reportRunService.loadByDataMartRunId.mockResolvedValue(reportRun);

      await service.executeExistingRun('data-mart-run-1', 'project-1', 'user-1');

      expect(reportRunService.finish).toHaveBeenCalled();
      expect(projectBilling.registerEmailBasedReportRunConsumption).toHaveBeenCalledWith(report);
      expect(reportRunService.finish.mock.invocationCallOrder[0]).toBeLessThan(
        projectBilling.registerEmailBasedReportRunConsumption.mock.invocationCallOrder[0]
      );
    }
  );

  it.each([
    DataDestinationType.GOOGLE_SHEETS,
    DataDestinationType.EMAIL,
    DataDestinationType.SLACK,
    DataDestinationType.MS_TEAMS,
    DataDestinationType.GOOGLE_CHAT,
  ])(
    'keeps successful %s report status when consumption registration fails',
    async destinationType => {
      const {
        service,
        reportReaderResolver,
        reportWriterResolver,
        reportRunService,
        projectBilling,
      } = createService();
      const report = createReport(destinationType);
      const reader = createReader();
      const writer = createWriter(destinationType);
      const reportRun = ReportRun.create(report, createDataMartRun(report));

      reader.readReportDataBatch.mockResolvedValue(new ReportDataBatch([], null));
      if (destinationType === DataDestinationType.GOOGLE_SHEETS) {
        writer.finalize.mockResolvedValue({
          consumption: {
            googleSheets: {
              googleSheetsDocumentTitle: 'Test Spreadsheet',
              googleSheetsListTitle: 'Sheet1',
            },
          },
        });
      }
      projectBilling.registerSheetsReportRunConsumption.mockRejectedValueOnce(
        new Error('pubsub unavailable')
      );
      projectBilling.registerEmailBasedReportRunConsumption.mockRejectedValueOnce(
        new Error('pubsub unavailable')
      );
      reportReaderResolver.resolve.mockResolvedValue(reader);
      reportWriterResolver.resolve.mockResolvedValue(writer);
      reportRunService.loadByDataMartRunId.mockResolvedValue(reportRun);

      await service.executeExistingRun('data-mart-run-1', 'project-1', 'user-1');

      expect(reportRunService.finish).toHaveBeenCalled();
      const consumptionMock =
        destinationType === DataDestinationType.GOOGLE_SHEETS
          ? projectBilling.registerSheetsReportRunConsumption
          : projectBilling.registerEmailBasedReportRunConsumption;
      expect(consumptionMock).toHaveBeenCalled();
      expect(reportRun.getDataMartRun().status).toBe(DataMartRunStatus.SUCCESS);
    }
  );

  it.each([
    [DataDestinationType.GOOGLE_SHEETS, RunKind.SHEETS_REPORT_RUN],
    [DataDestinationType.EMAIL, RunKind.EMAIL_BASED_REPORT_RUN],
    [DataDestinationType.SLACK, RunKind.EMAIL_BASED_REPORT_RUN],
  ])(
    'finishes a %s run as RESTRICTED when billing blocks the %s kind',
    async (destinationType, runKind) => {
      const { service, reportReaderResolver, reportRunService, projectBilling } = createService();
      const report = createReport(destinationType);
      const reportRun = ReportRun.create(report, createDataMartRun(report));

      projectBilling.verifyCanPerformOperations.mockRejectedValue(
        new ProjectOperationBlockedException([ProjectBlockedReason.LICENSE_REQUIRED])
      );
      reportRunService.loadByDataMartRunId.mockResolvedValue(reportRun);

      await service.executeExistingRun('data-mart-run-1', 'project-1', 'user-1');

      expect(projectBilling.verifyCanPerformOperations).toHaveBeenCalledWith('project-1', runKind);
      expect(reportReaderResolver.resolve).not.toHaveBeenCalled();
      expect(report.lastRunStatus).toBe(ReportRunStatus.RESTRICTED);
      expect(reportRun.getDataMartRun().status).toBe(DataMartRunStatus.RESTRICTED);
      expect(reportRun.getDataMartRun().errors).toEqual([
        expect.stringContaining('https://app.owox.com'),
      ]);
      expect(reportRunService.finish).toHaveBeenCalled();
    }
  );

  it('skips Google Sheets consumption when writer finalization returns no metadata', async () => {
    const {
      service,
      reportReaderResolver,
      reportWriterResolver,
      reportRunService,
      projectBilling,
    } = createService();
    const report = createReport(DataDestinationType.GOOGLE_SHEETS);
    const reader = createReader();
    const writer = createWriter(DataDestinationType.GOOGLE_SHEETS);
    const reportRun = ReportRun.create(report, createDataMartRun(report));

    reader.readReportDataBatch.mockResolvedValue(new ReportDataBatch([], null));
    reportReaderResolver.resolve.mockResolvedValue(reader);
    reportWriterResolver.resolve.mockResolvedValue(writer);
    reportRunService.loadByDataMartRunId.mockResolvedValue(reportRun);

    await service.executeExistingRun('data-mart-run-1', 'project-1', 'user-1');

    expect(reportRunService.finish).toHaveBeenCalled();
    expect(projectBilling.registerSheetsReportRunConsumption).not.toHaveBeenCalled();
    expect(reportRun.getDataMartRun().status).toBe(DataMartRunStatus.SUCCESS);
  });

  it('does not register Google Sheets consumption when reader finalization fails after writer finalization', async () => {
    const {
      service,
      reportReaderResolver,
      reportWriterResolver,
      reportRunService,
      projectBilling,
    } = createService();
    const report = createReport(DataDestinationType.GOOGLE_SHEETS);
    const reader = createReader();
    const writer = createWriter(DataDestinationType.GOOGLE_SHEETS);
    const reportRun = ReportRun.create(report, createDataMartRun(report));

    reader.readReportDataBatch.mockResolvedValue(new ReportDataBatch([], null));
    reader.finalize.mockRejectedValue(new Error('reader cleanup failed'));
    writer.finalize.mockResolvedValue({
      consumption: {
        googleSheets: {
          googleSheetsDocumentTitle: 'Test Spreadsheet',
          googleSheetsListTitle: 'Sheet1',
        },
      },
    });
    reportReaderResolver.resolve.mockResolvedValue(reader);
    reportWriterResolver.resolve.mockResolvedValue(writer);
    reportRunService.loadByDataMartRunId.mockResolvedValue(reportRun);

    await service.executeExistingRun('data-mart-run-1', 'project-1', 'user-1');

    expect(writer.finalize).toHaveBeenCalled();
    expect(reader.finalize).toHaveBeenCalled();
    expect(reportRun.getDataMartRun().status).toBe(DataMartRunStatus.FAILED);
    expect(projectBilling.registerSheetsReportRunConsumption).not.toHaveBeenCalled();
  });

  it.each([
    DataDestinationType.GOOGLE_SHEETS,
    DataDestinationType.EMAIL,
    DataDestinationType.SLACK,
    DataDestinationType.MS_TEAMS,
    DataDestinationType.GOOGLE_CHAT,
  ])(
    'does not register %s consumption when final report success is not persisted',
    async destinationType => {
      const {
        service,
        reportReaderResolver,
        reportWriterResolver,
        reportRunService,
        projectBilling,
      } = createService();
      const report = createReport(destinationType);
      const reader = createReader();
      const writer = createWriter(destinationType);
      const reportRun = ReportRun.create(report, createDataMartRun(report));

      reader.readReportDataBatch.mockResolvedValue(new ReportDataBatch([], null));
      if (destinationType === DataDestinationType.GOOGLE_SHEETS) {
        writer.finalize.mockResolvedValue({
          consumption: {
            googleSheets: {
              googleSheetsDocumentTitle: 'Test Spreadsheet',
              googleSheetsListTitle: 'Sheet1',
            },
          },
        });
      }
      reportReaderResolver.resolve.mockResolvedValue(reader);
      reportWriterResolver.resolve.mockResolvedValue(writer);
      reportRunService.loadByDataMartRunId.mockResolvedValue(reportRun);
      reportRunService.finish.mockRejectedValueOnce(new Error('db unavailable'));

      await service.executeExistingRun('data-mart-run-1', 'project-1', 'user-1');

      expect(reportRunService.finish).toHaveBeenCalled();
      expect(projectBilling.registerSheetsReportRunConsumption).not.toHaveBeenCalled();
      expect(projectBilling.registerEmailBasedReportRunConsumption).not.toHaveBeenCalled();
    }
  );

  describe('manual runs', () => {
    it('uses checkOperateAccess (not checkMutateAccess) for manual runs', async () => {
      const { service, reportAccessService, reportRunService, reportRunTriggerService } =
        createService();
      reportRunService.createPending.mockResolvedValue({
        getDataMart: () => ({ projectId: 'proj-1' }),
        getDataMartRun: () => ({ id: 'dmr-1' }),
      });

      await service.run({
        reportId: 'report-1',
        userId: 'user-1',
        roles: ['viewer'],
        runType: RunType.manual,
        projectId: 'proj-1',
      });

      expect(reportAccessService.checkOperateAccess).toHaveBeenCalledWith(
        'user-1',
        ['viewer'],
        'report-1',
        'proj-1'
      );
      expect(reportAccessService.checkMutateAccess).not.toHaveBeenCalled();
      expect(reportRunTriggerService.createTrigger).toHaveBeenCalled();
    });

    it('returns the enqueued run info', async () => {
      const { service, reportRunService } = createService();
      reportRunService.createPending.mockResolvedValue({
        getDataMart: () => ({ projectId: 'proj-1' }),
        getDataMartRun: () => ({ id: 'dmr-1' }),
      });

      await expect(
        service.run({
          reportId: 'report-1',
          userId: 'user-1',
          roles: ['viewer'],
          runType: RunType.manual,
          projectId: 'proj-1',
        })
      ).resolves.toEqual({ dataMartRunId: 'dmr-1' });
    });

    it('returns null when the report is already running or pending', async () => {
      const { service, reportRunService, reportRunTriggerService } = createService();
      reportRunService.createPending.mockResolvedValue(null);

      await expect(
        service.run({
          reportId: 'report-1',
          userId: 'user-1',
          roles: ['viewer'],
          runType: RunType.manual,
          projectId: 'proj-1',
        })
      ).resolves.toBeNull();
      expect(reportRunTriggerService.createTrigger).not.toHaveBeenCalled();
    });
  });

  it('keeps non-email destinations unchanged and reads all batches', async () => {
    const { service, reportReaderResolver, reportWriterResolver } = createService();
    const report = createReport(DataDestinationType.GOOGLE_SHEETS);
    const reader = createReader();
    const writer = createWriter(DataDestinationType.GOOGLE_SHEETS);

    reader.readReportDataBatch
      .mockResolvedValueOnce(new ReportDataBatch([[1], [2]], 'b2'))
      .mockResolvedValueOnce(new ReportDataBatch([[3], [4], [5]], null));

    reportReaderResolver.resolve.mockResolvedValue(reader);
    reportWriterResolver.resolve.mockResolvedValue(writer);

    await (
      service as unknown as {
        executeReport: (
          report: Report,
          accessor: { userId: string; roles: string[] }
        ) => Promise<void>;
      }
    ).executeReport(report, { userId: 'user-1', roles: ['admin'] });

    expect(reader.readReportDataBatch).toHaveBeenNthCalledWith(1, undefined);
    expect(reader.readReportDataBatch).toHaveBeenNthCalledWith(2, 'b2');
    expect(reader.readReportDataBatch).toHaveBeenCalledTimes(2);

    const firstBatch = writer.writeReportDataBatch.mock.calls[0][0] as ReportDataBatch;
    const secondBatch = writer.writeReportDataBatch.mock.calls[1][0] as ReportDataBatch;
    expect(firstBatch.dataRows).toEqual([[1], [2]]);
    expect(secondBatch.dataRows).toEqual([[3], [4], [5]]);
    expect(writer.finalize).toHaveBeenCalledWith(undefined, {
      mainRowsTruncationInfo: null,
    });
  });

  it('journals data last updated on the run record and persists it for a NON-blended run', async () => {
    const {
      service,
      reportReaderResolver,
      reportWriterResolver,
      blendedReportDataService,
      sourceDataLastUpdatedService,
      dataMartService,
    } = createService();
    const report = createReport(DataDestinationType.GOOGLE_SHEETS);
    blendedReportDataService.resolveBlendingDecision.mockResolvedValue({ needsBlending: false });
    const measured = {
      dataLastUpdatedAt: '2026-07-30T08:00:00.000Z',
      computedAt: '2026-07-31T00:00:00.000Z',
      coverage: 'complete' as const,
      sources: [{ table: 'p.d.t', dataLastUpdatedAt: '2026-07-30T08:00:00.000Z' }],
    };
    sourceDataLastUpdatedService.resolveForDefinition.mockResolvedValue(measured);

    const reader = createReader();
    reader.readReportDataBatch.mockResolvedValue(new ReportDataBatch([], undefined));
    const writer = createWriter(DataDestinationType.GOOGLE_SHEETS);
    reportReaderResolver.resolve.mockResolvedValue(reader);
    reportWriterResolver.resolve.mockResolvedValue(writer);

    const dataMartRun = createDataMartRun(report);
    dataMartRun.reportDefinition = { title: 'Report' } as never;

    await (
      service as unknown as {
        executeReport: (
          report: Report,
          accessor: { userId: string; roles: string[] },
          signal?: AbortSignal,
          logger?: unknown,
          dataMartRun?: DataMartRun
        ) => Promise<void>;
      }
    ).executeReport(
      report,
      { userId: 'user-1', roles: ['admin'] },
      undefined,
      undefined,
      dataMartRun
    );

    // Journalled on the run record (persisted at finish), and — since a non-blended run reads
    // exactly this Data Mart's own sources — saved as the last-known value too.
    expect(dataMartRun.reportDefinition!.dataLastUpdated).toEqual(measured);
    expect(dataMartService.updateDataLastUpdated).toHaveBeenCalledWith(
      report.dataMart.id,
      report.dataMart.projectId,
      measured
    );
    // The in-memory entity must carry the fresh value too: Report.dataMart is saved with
    // cascade when the run finishes, and a stale snapshot would overwrite the persisted column.
    expect(report.dataMart.dataLastUpdated).toEqual(measured);
  });

  it('keeps the in-memory entity untouched when the monotonicity guard rejects the write', async () => {
    // If the DB already holds a newer measurement (saved mid-run by Check now or an MCP
    // query), mirroring the rejected block in memory would let a future cascade save write
    // the OLDER value back, bypassing the guard.
    const {
      service,
      reportReaderResolver,
      reportWriterResolver,
      blendedReportDataService,
      sourceDataLastUpdatedService,
      dataMartService,
    } = createService();
    const report = createReport(DataDestinationType.GOOGLE_SHEETS);
    blendedReportDataService.resolveBlendingDecision.mockResolvedValue({ needsBlending: false });
    const measured = {
      dataLastUpdatedAt: '2026-07-30T08:00:00.000Z',
      computedAt: '2026-07-31T00:00:00.000Z',
      coverage: 'complete' as const,
      sources: [{ table: 'p.d.t', dataLastUpdatedAt: '2026-07-30T08:00:00.000Z' }],
    };
    sourceDataLastUpdatedService.resolveForDefinition.mockResolvedValue(measured);
    dataMartService.updateDataLastUpdated.mockResolvedValue(false);

    const reader = createReader();
    reader.readReportDataBatch.mockResolvedValue(new ReportDataBatch([], undefined));
    const writer = createWriter(DataDestinationType.GOOGLE_SHEETS);
    reportReaderResolver.resolve.mockResolvedValue(reader);
    reportWriterResolver.resolve.mockResolvedValue(writer);

    await (
      service as unknown as {
        executeReport: (
          report: Report,
          accessor: { userId: string; roles: string[] },
          signal?: AbortSignal,
          logger?: unknown,
          dataMartRun?: DataMartRun
        ) => Promise<void>;
      }
    ).executeReport(report, { userId: 'user-1', roles: ['admin'] });

    expect(dataMartService.updateDataLastUpdated).toHaveBeenCalled();
    expect(report.dataMart.dataLastUpdated).toBeUndefined();
  });

  it('measures the blended SQL and journals WITHOUT persisting for a blended run', async () => {
    const {
      service,
      reportReaderResolver,
      reportWriterResolver,
      blendedReportDataService,
      sourceDataLastUpdatedService,
      dataMartService,
    } = createService();
    const report = createReport(DataDestinationType.GOOGLE_SHEETS);
    blendedReportDataService.resolveBlendingDecision.mockResolvedValue({
      needsBlending: true,
      blendedSql: 'SELECT blended',
      params: [],
    });
    const measured = {
      dataLastUpdatedAt: '2026-07-30T08:00:00.000Z',
      computedAt: '2026-07-31T00:00:00.000Z',
      coverage: 'complete' as const,
      sources: [],
    };
    sourceDataLastUpdatedService.resolveForSql.mockResolvedValue(measured);

    const reader = createReader();
    reader.readReportDataBatch.mockResolvedValue(new ReportDataBatch([], undefined));
    const writer = createWriter(DataDestinationType.GOOGLE_SHEETS);
    reportReaderResolver.resolve.mockResolvedValue(reader);
    reportWriterResolver.resolve.mockResolvedValue(writer);

    const dataMartRun = createDataMartRun(report);
    dataMartRun.reportDefinition = { title: 'Report' } as never;

    await (
      service as unknown as {
        executeReport: (
          report: Report,
          accessor: { userId: string; roles: string[] },
          signal?: AbortSignal,
          logger?: unknown,
          dataMartRun?: DataMartRun
        ) => Promise<void>;
      }
    ).executeReport(
      report,
      { userId: 'user-1', roles: ['admin'] },
      undefined,
      undefined,
      dataMartRun
    );

    expect(sourceDataLastUpdatedService.resolveForSql).toHaveBeenCalledWith(
      expect.objectContaining({ sql: 'SELECT blended' })
    );
    expect(sourceDataLastUpdatedService.resolveForDefinition).not.toHaveBeenCalled();
    expect(dataMartRun.reportDefinition!.dataLastUpdated).toEqual(measured);
    // A blended measurement spans several Data Marts and would overstate this one.
    expect(dataMartService.updateDataLastUpdated).not.toHaveBeenCalled();
    expect(report.dataMart.dataLastUpdated).toBeUndefined();
  });

  it('stores reportDefinition.executionSqlQuery (inlined SQL) when output controls are present', async () => {
    const {
      service,
      reportReaderResolver,
      reportWriterResolver,
      blendedReportDataService,
      reportSqlComposerService,
    } = createService();
    const report = createReport(DataDestinationType.GOOGLE_SHEETS);
    report.filterConfig = [{ column: 'a', operator: 'eq', value: 1 }] as never;
    blendedReportDataService.resolveBlendingDecision.mockResolvedValue({ needsBlending: false });
    reportSqlComposerService.compose.mockResolvedValue({
      sql: 'SELECT * FROM t WHERE a = @p0',
      params: [{ name: 'p0', value: 1 }],
    });
    reportSqlComposerService.inlineStaticSql.mockReturnValue('SELECT * FROM t WHERE a = 1');

    const reader = createReader();
    reader.readReportDataBatch.mockResolvedValue(new ReportDataBatch([], undefined));
    const writer = createWriter(DataDestinationType.GOOGLE_SHEETS);
    reportReaderResolver.resolve.mockResolvedValue(reader);
    reportWriterResolver.resolve.mockResolvedValue(writer);

    const dataMartRun = createDataMartRun(report);
    dataMartRun.reportDefinition = { title: 'Report' } as never;

    await (
      service as unknown as {
        executeReport: (
          report: Report,
          accessor: { userId: string; roles: string[] },
          signal?: AbortSignal,
          logger?: unknown,
          dataMartRun?: DataMartRun
        ) => Promise<void>;
      }
    ).executeReport(
      report,
      { userId: 'user-1', roles: ['admin'] },
      undefined,
      undefined,
      dataMartRun
    );

    expect(reportSqlComposerService.inlineStaticSql).toHaveBeenCalledWith(
      DataStorageType.GOOGLE_BIGQUERY,
      'SELECT * FROM t WHERE a = @p0',
      [{ name: 'p0', value: 1 }]
    );
    expect(dataMartRun.reportDefinition!.executionSqlQuery).toBe('SELECT * FROM t WHERE a = 1');
  });

  // Orchestrator-level pin for hasOutputControls' calculated-metric branch: a report with NO
  // filter/sort/aggregation/dateTrunc/limit/uniqueCount — only a calculated field selected in
  // columnConfig — must still reach ReportSqlComposerService.compose. Before that predicate was
  // widened, this exact shape returned false, compose() was never called, sqlOverride stayed
  // undefined, and the reader would have fallen back to a bare buildQuery(definition, { columns })
  // call that emits 'ctr' as a plain, nonexistent column.
  it('composes SQL and forwards calculatedFields for a report selecting only a calculated field', async () => {
    const {
      service,
      reportReaderResolver,
      reportWriterResolver,
      blendedReportDataService,
      reportSqlComposerService,
    } = createService();
    const report = createReport(DataDestinationType.GOOGLE_SHEETS);
    report.columnConfig = ['clicks', 'ctr'] as never;
    report.dataMart = {
      ...report.dataMart,
      schema: {
        fields: [
          { name: 'clicks', type: 'INTEGER', status: 'CONNECTED' },
          { name: 'impressions', type: 'INTEGER', status: 'CONNECTED' },
          {
            name: 'ctr',
            type: 'FLOAT',
            status: 'CONNECTED',
            calculated: {
              formula: 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)',
              level: 'metric',
            },
          },
        ],
      },
    } as never;
    blendedReportDataService.resolveBlendingDecision.mockResolvedValue({
      needsBlending: false,
      columnFilter: ['clicks', 'ctr'],
    });
    const calculatedField = {
      outputName: 'ctr',
      type: 'FLOAT',
      formula: 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)',
    };
    reportSqlComposerService.compose.mockResolvedValue({
      sql:
        'SELECT `clicks`, SUM(`clicks`) / NULLIF(SUM(`impressions`), 0) AS `ctr` ' +
        'FROM t GROUP BY `clicks`',
      params: [],
      calculatedFields: [calculatedField],
    });

    const reader = createReader();
    reader.readReportDataBatch.mockResolvedValue(new ReportDataBatch([], undefined));
    const writer = createWriter(DataDestinationType.GOOGLE_SHEETS);
    reportReaderResolver.resolve.mockResolvedValue(reader);
    reportWriterResolver.resolve.mockResolvedValue(writer);

    const dataMartRun = createDataMartRun(report);
    dataMartRun.reportDefinition = { title: 'Report' } as never;

    await (
      service as unknown as {
        executeReport: (
          report: Report,
          accessor: { userId: string; roles: string[] },
          signal?: AbortSignal,
          logger?: unknown,
          dataMartRun?: DataMartRun
        ) => Promise<void>;
      }
    ).executeReport(
      report,
      { userId: 'user-1', roles: ['admin'] },
      undefined,
      undefined,
      dataMartRun
    );

    // The metric alone flipped hasOutputControls — compose() was reached with no other control set.
    expect(reportSqlComposerService.compose).toHaveBeenCalledWith(report, {
      userId: 'user-1',
      roles: ['admin'],
    });
    expect(reader.prepareReportData).toHaveBeenCalledWith(
      report,
      expect.objectContaining({
        sqlOverride: expect.stringContaining('ctr'),
        calculatedFields: [calculatedField],
        // The metric's own name is excluded from columnFilter — it renders through
        // calculatedFields, not the plain projection (or the reader double-emits its header).
        columnFilter: ['clicks'],
      })
    );
  });

  // The blended twin of the test above: `compose` never runs on that branch, so the decision is
  // the metric's ONLY plan source. Without forwarding it, the blended SQL emits `ctr` while the
  // header list has no entry naming it — the reader streams a silent null for every row.
  it("forwards the decision's calculatedFields on the blended branch", async () => {
    const { service, reportReaderResolver, reportWriterResolver, blendedReportDataService } =
      createService();
    const report = createReport(DataDestinationType.GOOGLE_SHEETS);
    report.columnConfig = ['ctr', 'orders__amount'] as never;
    const calculatedField = {
      outputName: 'ctr',
      type: 'FLOAT',
      formula: 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)',
    };
    blendedReportDataService.resolveBlendingDecision.mockResolvedValue({
      needsBlending: true,
      blendedSql: 'WITH main AS (...) SELECT SUM(main.clicks) AS `ctr`, orders.orders__amount',
      columnFilter: ['orders__amount'],
      calculatedFields: [calculatedField],
    });

    const reader = createReader();
    reader.readReportDataBatch.mockResolvedValue(new ReportDataBatch([], undefined));
    const writer = createWriter(DataDestinationType.GOOGLE_SHEETS);
    reportReaderResolver.resolve.mockResolvedValue(reader);
    reportWriterResolver.resolve.mockResolvedValue(writer);

    await (
      service as unknown as {
        executeReport: (
          report: Report,
          accessor: { userId: string; roles: string[] }
        ) => Promise<void>;
      }
    ).executeReport(report, { userId: 'user-1', roles: ['admin'] });

    expect(reader.prepareReportData).toHaveBeenCalledWith(
      report,
      expect.objectContaining({
        calculatedFields: [calculatedField],
        columnFilter: ['orders__amount'],
      })
    );
  });

  it('does not abort the run when recording executionSqlQuery throws (best-effort metadata)', async () => {
    const {
      service,
      reportReaderResolver,
      reportWriterResolver,
      blendedReportDataService,
      reportSqlComposerService,
    } = createService();
    const report = createReport(DataDestinationType.GOOGLE_SHEETS);
    report.filterConfig = [{ column: 'a', operator: 'eq', value: 1 }] as never;
    blendedReportDataService.resolveBlendingDecision.mockResolvedValue({ needsBlending: false });
    reportSqlComposerService.compose.mockResolvedValue({
      sql: 'SELECT * FROM t WHERE a = @p0',
      params: [{ name: 'p0', value: 1 }],
    });
    reportSqlComposerService.inlineStaticSql.mockImplementation(() => {
      throw new Error('no inliner for this dialect');
    });

    const reader = createReader();
    reader.readReportDataBatch.mockResolvedValue(new ReportDataBatch([], undefined));
    const writer = createWriter(DataDestinationType.GOOGLE_SHEETS);
    reportReaderResolver.resolve.mockResolvedValue(reader);
    reportWriterResolver.resolve.mockResolvedValue(writer);

    const dataMartRun = createDataMartRun(report);
    dataMartRun.reportDefinition = { title: 'Report' } as never;

    // Awaiting throws if executeReport rejected — proves the run was NOT aborted.
    await (
      service as unknown as {
        executeReport: (
          report: Report,
          accessor: { userId: string; roles: string[] },
          signal?: AbortSignal,
          logger?: unknown,
          dataMartRun?: DataMartRun
        ) => Promise<void>;
      }
    ).executeReport(
      report,
      { userId: 'user-1', roles: ['admin'] },
      undefined,
      undefined,
      dataMartRun
    );

    expect(reader.prepareReportData).toHaveBeenCalled();
    expect(dataMartRun.reportDefinition!.executionSqlQuery).toBeUndefined();
  });

  it('persists executionSqlQuery on the run record even when the read fails', async () => {
    const {
      service,
      reportReaderResolver,
      reportWriterResolver,
      blendedReportDataService,
      reportRunService,
      reportSqlComposerService,
    } = createService();
    const report = createReport(DataDestinationType.GOOGLE_SHEETS);
    report.filterConfig = [{ column: 'a', operator: 'eq', value: 1 }] as never;
    blendedReportDataService.resolveBlendingDecision.mockResolvedValue({ needsBlending: false });
    reportSqlComposerService.compose.mockResolvedValue({
      sql: 'SELECT * FROM t WHERE a = @p0',
      params: [{ name: 'p0', value: 1 }],
    });
    reportSqlComposerService.inlineStaticSql.mockReturnValue('SELECT * FROM t WHERE a = 1');

    const reader = createReader();
    reader.prepareReportData.mockRejectedValue(new Error('storage 500'));
    const writer = createWriter(DataDestinationType.GOOGLE_SHEETS);
    reportReaderResolver.resolve.mockResolvedValue(reader);
    reportWriterResolver.resolve.mockResolvedValue(writer);

    const dataMartRun = createDataMartRun(report);
    dataMartRun.reportDefinition = { title: 'Report' } as never;
    const reportRun = ReportRun.create(report, dataMartRun);
    reportRunService.loadByDataMartRunId.mockResolvedValue(reportRun);

    await service.executeExistingRun('data-mart-run-1', 'project-1', 'user-1');

    expect(reportRun.getDataMartRun().status).toBe(DataMartRunStatus.FAILED);
    expect(reportRun.getDataMartRun().reportDefinition!.executionSqlQuery).toBe(
      'SELECT * FROM t WHERE a = 1'
    );
    expect(reportRunService.finish).toHaveBeenCalled();
  });

  it('sets executionSqlQuery via inlineStaticSql using blendedSql when blending is needed', async () => {
    const {
      service,
      reportReaderResolver,
      reportWriterResolver,
      blendedReportDataService,
      reportSqlComposerService,
    } = createService();
    const report = createReport(DataDestinationType.GOOGLE_SHEETS);
    report.filterConfig = [{ column: 'x', operator: 'eq', value: 'y' }] as never;

    const blendedSql = 'WITH m AS (...) SELECT * FROM m WHERE x = @p0';
    const params = [{ name: 'p0', value: 'y' }];
    blendedReportDataService.resolveBlendingDecision.mockResolvedValue({
      needsBlending: true,
      blendedSql,
      params,
    });
    reportSqlComposerService.inlineStaticSql.mockReturnValue(
      "WITH m AS (...) SELECT * FROM m WHERE x = 'y'"
    );

    const reader = createReader();
    reader.readReportDataBatch.mockResolvedValue(new ReportDataBatch([], undefined));
    const writer = createWriter(DataDestinationType.GOOGLE_SHEETS);
    reportReaderResolver.resolve.mockResolvedValue(reader);
    reportWriterResolver.resolve.mockResolvedValue(writer);

    const dataMartRun = createDataMartRun(report);
    dataMartRun.reportDefinition = { title: 'Report' } as never;

    await (
      service as unknown as {
        executeReport: (
          report: Report,
          accessor: { userId: string; roles: string[] },
          signal?: AbortSignal,
          logger?: unknown,
          dataMartRun?: DataMartRun
        ) => Promise<void>;
      }
    ).executeReport(
      report,
      { userId: 'user-1', roles: ['admin'] },
      undefined,
      undefined,
      dataMartRun
    );

    expect(reportSqlComposerService.inlineStaticSql).toHaveBeenCalledWith(
      DataStorageType.GOOGLE_BIGQUERY,
      blendedSql,
      params
    );
    expect(dataMartRun.reportDefinition!.executionSqlQuery).toBe(
      "WITH m AS (...) SELECT * FROM m WHERE x = 'y'"
    );
  });

  it('does not set executionSqlQuery when there are no output controls or blending', async () => {
    const { service, reportReaderResolver, reportWriterResolver, reportSqlComposerService } =
      createService();
    const report = createReport(DataDestinationType.GOOGLE_SHEETS);

    const reader = createReader();
    reader.readReportDataBatch.mockResolvedValue(new ReportDataBatch([], undefined));
    const writer = createWriter(DataDestinationType.GOOGLE_SHEETS);
    reportReaderResolver.resolve.mockResolvedValue(reader);
    reportWriterResolver.resolve.mockResolvedValue(writer);

    const dataMartRun = createDataMartRun(report);
    dataMartRun.reportDefinition = { title: 'Report' } as never;

    await (
      service as unknown as {
        executeReport: (
          report: Report,
          accessor: { userId: string; roles: string[] },
          signal?: AbortSignal,
          logger?: unknown,
          dataMartRun?: DataMartRun
        ) => Promise<void>;
      }
    ).executeReport(
      report,
      { userId: 'user-1', roles: ['admin'] },
      undefined,
      undefined,
      dataMartRun
    );

    expect(reportSqlComposerService.inlineStaticSql).not.toHaveBeenCalled();
    expect(dataMartRun.reportDefinition!.executionSqlQuery).toBeUndefined();
  });

  // Finding B: prepareReportData must receive uniqueCount: true when the report has
  // uniqueCountConfig === true, so that resolveReportDataHeaders appends the
  // "Unique Count" header — without which the SQL column would be silently dropped.
  it('passes uniqueCount: true to prepareReportData when report.uniqueCountConfig === true', async () => {
    const { service, reportReaderResolver, reportWriterResolver } = createService();
    const report = createReport(DataDestinationType.GOOGLE_SHEETS);
    report.uniqueCountConfig = true;

    const reader = createReader();
    reader.readReportDataBatch.mockResolvedValue(new ReportDataBatch([], undefined));
    const writer = createWriter(DataDestinationType.GOOGLE_SHEETS);
    reportReaderResolver.resolve.mockResolvedValue(reader);
    reportWriterResolver.resolve.mockResolvedValue(writer);

    await (
      service as unknown as {
        executeReport: (
          report: Report,
          accessor: { userId: string; roles: string[] }
        ) => Promise<void>;
      }
    ).executeReport(report, { userId: 'user-1', roles: ['admin'] });

    expect(reader.prepareReportData).toHaveBeenCalledWith(
      report,
      expect.objectContaining({ uniqueCount: true })
    );
  });

  // Finding B: when uniqueCountConfig is null/absent, uniqueCount must NOT be true.
  it('does NOT pass uniqueCount: true to prepareReportData when report.uniqueCountConfig is null', async () => {
    const { service, reportReaderResolver, reportWriterResolver } = createService();
    const report = createReport(DataDestinationType.GOOGLE_SHEETS);
    report.uniqueCountConfig = null;

    const reader = createReader();
    reader.readReportDataBatch.mockResolvedValue(new ReportDataBatch([], undefined));
    const writer = createWriter(DataDestinationType.GOOGLE_SHEETS);
    reportReaderResolver.resolve.mockResolvedValue(reader);
    reportWriterResolver.resolve.mockResolvedValue(writer);

    await (
      service as unknown as {
        executeReport: (
          report: Report,
          accessor: { userId: string; roles: string[] }
        ) => Promise<void>;
      }
    ).executeReport(report, { userId: 'user-1', roles: ['admin'] });

    expect(reader.prepareReportData).toHaveBeenCalledWith(
      report,
      expect.not.objectContaining({ uniqueCount: true })
    );
  });

  // Drop any one of these and the SQL emits a column the header list has no entry for —
  // the header/column desync that silently shifts every value in a scheduled run.
  it('forwards the blending decision primaryKeyColumns and uniqueCountSources to prepareReportData', async () => {
    const { service, reportReaderResolver, reportWriterResolver, blendedReportDataService } =
      createService();
    const report = createReport(DataDestinationType.GOOGLE_SHEETS);
    report.uniqueCountConfig = ['', 'orders'];

    const uniqueCountSources = [
      {
        aliasPath: 'orders',
        cteName: 'orders_cte',
        pkColumns: ['order_id'],
        outputLabel: 'orders__unique_count',
        displayLabel: 'Orders Unique Count',
      },
    ];
    blendedReportDataService.resolveBlendingDecision.mockResolvedValue({
      needsBlending: false,
      primaryKeyColumns: ['id'],
      uniqueCountSources,
    });

    const reader = createReader();
    reader.readReportDataBatch.mockResolvedValue(new ReportDataBatch([], undefined));
    const writer = createWriter(DataDestinationType.GOOGLE_SHEETS);
    reportReaderResolver.resolve.mockResolvedValue(reader);
    reportWriterResolver.resolve.mockResolvedValue(writer);

    await (
      service as unknown as {
        executeReport: (
          report: Report,
          accessor: { userId: string; roles: string[] }
        ) => Promise<void>;
      }
    ).executeReport(report, { userId: 'user-1', roles: ['admin'] });

    expect(reader.prepareReportData).toHaveBeenCalledWith(
      report,
      expect.objectContaining({
        uniqueCount: true,
        primaryKeyColumns: ['id'],
        uniqueCountSources,
      })
    );
  });
});
