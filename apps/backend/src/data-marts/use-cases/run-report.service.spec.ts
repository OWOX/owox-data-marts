jest.mock('../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { ReportDataBatch } from '../dto/domain/report-data-batch.dto';
import { ReportDataDescription } from '../dto/domain/report-data-description.dto';
import { ReportDataHeader } from '../dto/domain/report-data-header.dto';
import { DataDestination } from '../entities/data-destination.entity';
import { Report } from '../entities/report.entity';
import { ReportExecutionPolicyResolver } from './report-execution-policy.resolver';
import { RunReportService } from './run-report.service';

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
    const projectBalanceService = {
      verifyCanPerformOperations: jest.fn().mockResolvedValue(undefined),
    };
    const blendedReportDataService = {
      // Default: no columnConfig -> no blending, no filter.
      resolveBlendingDecision: jest.fn().mockResolvedValue({ needsBlending: false }),
      logBlendedSqlIfNeeded: jest.fn(),
    };

    const service = new RunReportService(
      reportReaderResolver as never,
      reportWriterResolver as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      projectBalanceService as never,
      new ReportExecutionPolicyResolver(),
      {} as never,
      { checkMutateAccess: jest.fn().mockResolvedValue(undefined) } as never,
      blendedReportDataService as never
    );

    return {
      service,
      reportReaderResolver,
      reportWriterResolver,
      projectBalanceService,
      blendedReportDataService,
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
    const { service, reportReaderResolver, reportWriterResolver, projectBalanceService } =
      createService();
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
      service as unknown as { executeReport: (report: Report) => Promise<void> }
    ).executeReport(report);

    expect(projectBalanceService.verifyCanPerformOperations).toHaveBeenCalledWith('project-1');
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
      service as unknown as { executeReport: (report: Report) => Promise<void> }
    ).executeReport(report);

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

  it('forwards blending decision and run logger to logBlendedSqlIfNeeded', async () => {
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

    const mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      asArrays: jest.fn().mockReturnValue({ logs: [], errors: [] }),
    };

    await (
      service as unknown as {
        executeReport: (report: Report, signal?: AbortSignal, logger?: unknown) => Promise<void>;
      }
    ).executeReport(report, undefined, mockLogger);

    expect(blendedReportDataService.resolveBlendingDecision).toHaveBeenCalledWith(report);
    expect(blendedReportDataService.logBlendedSqlIfNeeded).toHaveBeenCalledWith(
      decision,
      mockLogger
    );
  });
});
