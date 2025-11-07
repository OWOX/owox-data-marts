import { Inject, Injectable, Logger } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { GracefulShutdownService } from '../../common/scheduler/services/graceful-shutdown.service';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { DATA_DESTINATION_REPORT_WRITER_RESOLVER } from '../data-destination-types/data-destination-providers';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { DataDestinationReportWriter } from '../data-destination-types/interfaces/data-destination-report-writer.interface';
import { DATA_STORAGE_REPORT_READER_RESOLVER } from '../data-storage-types/data-storage-providers';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataStorageReportReader } from '../data-storage-types/interfaces/data-storage-report-reader.interface';
import { RunReportCommand } from '../dto/domain/run-report.command';
import { Report } from '../entities/report.entity';
import { DataMartService } from '../services/data-mart.service';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import { DataMart } from '../entities/data-mart.entity';
import { ReportRun } from '../models/report-run.model';
import { ReportRunService } from '../services/report-run.service';

const ERROR_NAMES = {
  ABORT: 'AbortError',
} as const;

@Injectable()
export class RunReportService {
  private readonly logger = new Logger(RunReportService.name);

  constructor(
    @Inject(DATA_STORAGE_REPORT_READER_RESOLVER)
    private readonly reportReaderResolver: TypeResolver<DataStorageType, DataStorageReportReader>,
    @Inject(DATA_DESTINATION_REPORT_WRITER_RESOLVER)
    private readonly reportWriterResolver: TypeResolver<
      DataDestinationType,
      DataDestinationReportWriter
    >,
    private readonly dataMartService: DataMartService,
    private readonly gracefulShutdownService: GracefulShutdownService,
    private readonly systemTimeService: SystemTimeService,
    private readonly reportRunService: ReportRunService
  ) {}

  runInBackground(command: RunReportCommand): void {
    this.run(command).catch(error => {
      this.logger.error(`Error running report ${command.reportId} asynchronously:`, error);
    });
  }

  async run(command: RunReportCommand, signal?: AbortSignal): Promise<void> {
    this.validateCanRun();

    this.logger.log(`Starting report run ${command.reportId}`);

    const reportRun = await this.reportRunService.createPending(command);
    if (!reportRun) {
      this.logger.log(
        `Report ${command.reportId} is already running or pending, skipping execution`
      );
      return;
    }

    await this.executeReportRunWithCleanup(reportRun, signal);
  }

  private async executeReport(report: Report, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    const { dataMart, dataDestination } = report;
    const reportReader = await this.reportReaderResolver.resolve(dataMart.storage.type);
    const reportWriter = await this.reportWriterResolver.resolve(dataDestination.type);
    let processingError: Error | undefined = undefined;
    try {
      signal?.throwIfAborted();
      const reportDataDescription = await reportReader.prepareReportData(report);
      this.logger.debug(`Report data prepared for ${report.id}:`, reportDataDescription);
      await reportWriter.prepareToWriteReport(report, reportDataDescription);
      let nextReportDataBatch: string | undefined | null = undefined;
      do {
        signal?.throwIfAborted();
        const batch = await reportReader.readReportDataBatch(nextReportDataBatch);
        await reportWriter.writeReportDataBatch(batch);
        nextReportDataBatch = batch.nextDataBatchId;
        this.logger.debug(`${batch.dataRows.length} data rows written for report ${report.id}`);
      } while (nextReportDataBatch);
    } catch (error) {
      processingError = error;
      throw error;
    } finally {
      await reportWriter.finalize(processingError);
      await reportReader.finalize();
    }
  }

  private async executeReportRunWithCleanup(
    reportRun: ReportRun,
    signal?: AbortSignal
  ): Promise<void> {
    const processId = this.generateProcessId(reportRun.getReportId());

    try {
      this.gracefulShutdownService.registerActiveProcess(processId);
      await this.actualizeSchemaInDataMart(reportRun.report.dataMart);
      await this.reportRunService.markAsStarted(reportRun);
      this.logger.log(`Report ${reportRun.getReportId()} execution started`);
      await this.executeReport(reportRun.report, signal);
      await this.handleReportRunSuccess(reportRun);
    } catch (error) {
      await this.handleReportRunError(reportRun, error);
    } finally {
      this.gracefulShutdownService.unregisterActiveProcess(processId);
    }
  }

  private validateCanRun() {
    if (this.gracefulShutdownService.isInShutdownMode()) {
      throw new BusinessViolationException(
        'Application is shutting down, cannot start new reports'
      );
    }
  }

  private generateProcessId(reportId: string): string {
    const timestamp = this.systemTimeService.now();
    const random = Math.random().toString(36).substring(2, 11);
    return `report-${reportId}-${timestamp}-${random}`;
  }

  private async actualizeSchemaInDataMart(dataMart: DataMart): Promise<void> {
    await this.dataMartService.actualizeSchemaInEntity(dataMart);
    await this.dataMartService.save(dataMart);
  }

  private async handleReportRunSuccess(reportRun: ReportRun): Promise<void> {
    reportRun.markAsSuccess();

    const saved = await this.saveReportRunResultSafely(reportRun);
    if (saved) {
      this.logger.log(`Report ${reportRun.getReportId()} completed successfully`);
    }
  }

  private async handleReportRunError(reportRun: ReportRun, error: Error): Promise<void> {
    if (error.name === ERROR_NAMES.ABORT) {
      reportRun.markAsCancelled();
      this.logger.warn(`Report ${reportRun.getReportId()} was cancelled by user`);
    } else {
      reportRun.markAsFailed(error);
      this.logger.error(`Report ${reportRun.getReportId()} execution failed:`, error);
    }
    await this.saveReportRunResultSafely(reportRun);
  }

  private async saveReportRunResultSafely(reportRun: ReportRun): Promise<boolean> {
    try {
      await this.reportRunService.finish(reportRun);
      return true;
    } catch (saveError) {
      this.logger.error(
        `Failed to persist final status for report ${reportRun.getReportId()}:`,
        saveError
      );
    }
    return false;
  }
}
