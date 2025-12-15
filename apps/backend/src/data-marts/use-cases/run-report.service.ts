import { Inject, Injectable, Logger } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { GracefulShutdownService } from '../../common/scheduler/services/graceful-shutdown.service';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { AvailableDestinationTypesService } from '../data-destination-types/available-destination-types.service';
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
import { createReportRunLogger, ReportRunLogger } from '../report-run-logging/report-run-logger';

const ERROR_NAMES = {
  ABORT: 'AbortError',
} as const;

/**
 * Use case for executing scheduled and manual report runs.
 *
 * This is the main orchestrator for report execution, coordinating multiple services
 * to read data from storage, transform it, and write to destination.
 *
 * Responsibilities:
 * - Managing complete report execution lifecycle
 * - Coordinating data readers and writers via resolver pattern
 * - Handling cancellation via AbortSignal
 * - Preventing new runs during graceful shutdown
 * - Actualizing data mart schema before execution
 * - Tracking active processes for graceful shutdown
 *
 * Execution flow:
 * 1. Validate system can run (not in shutdown)
 * 2. Create pending ReportRun with optimistic locking
 * 3. Register process for graceful shutdown tracking
 * 4. Actualize data mart schema
 * 5. Mark run as started
 * 6. Execute data extraction and writing in batches
 * 7. Handle success/failure/cancellation
 * 8. Persist final status in transaction
 * 9. Unregister process
 *
 * Concurrency handling:
 * - Returns early if report already running (null from createPending)
 * - Optimistic locking prevents concurrent runs of same report
 * - Multiple different reports can run concurrently
 *
 * Cancellation support:
 * - Accepts optional AbortSignal for user/system cancellation
 * - Checks signal before each batch operation
 * - Marks run as CANCELLED on AbortError
 *
 * @see ReportRun - Domain model for report run
 */
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
    private readonly reportRunService: ReportRunService,
    private readonly availableDestinationTypesService: AvailableDestinationTypesService
  ) {}

  /**
   * Executes report run in background (fire-and-forget).
   * Errors are logged but not propagated to caller.
   *
   * Used for async execution from schedulers or message queues.
   *
   * @param command - Report run command with reportId, userId, runType
   */
  runInBackground(command: RunReportCommand): void {
    this.run(command).catch(error => {
      this.logger.error(`Error running report ${command.reportId} asynchronously:`, error);
    });
  }

  /**
   * Executes report run synchronously.
   *
   * Steps:
   * 1. Validates system can run (not in shutdown)
   * 2. Creates pending run (returns null if already running)
   * 3. Executes report with cleanup and error handling
   *
   * @param command - Report run command with reportId, userId, runType
   * @param signal - Optional AbortSignal for cancellation support
   * @returns Promise that resolves when run completes or is skipped
   */
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

  /**
   * Executes core report data extraction and writing logic.
   *
   * Process:
   * 1. Resolves reader for data storage type (BigQuery, Athena, etc.)
   * 2. Resolves writer for destination type (Looker Studio, Google Sheets, etc.)
   * 3. Prepares report data (gets metadata, row count, etc.)
   * 4. Initializes writer for batch writing
   * 5. Reads and writes data in batches until complete
   * 6. Finalizes both reader and writer (cleanup resources)
   *
   * Cancellation: Checks AbortSignal before each batch operation.
   *
   * @param report - Report entity with storage and destination config
   * @param signal - Optional AbortSignal for cancellation
   * @param reportRunLogger - Optional run-scoped structured logger.
   * @throws Error if read/write fails, propagated to caller
   */
  private async executeReport(
    report: Report,
    signal?: AbortSignal,
    reportRunLogger?: ReportRunLogger
  ): Promise<void> {
    signal?.throwIfAborted();
    const { dataMart, dataDestination } = report;
    const reportReader = await this.reportReaderResolver.resolve(dataMart.storage.type);
    const reportWriter = await this.reportWriterResolver.resolve(dataDestination.type);
    let processingError: Error | undefined = undefined;
    try {
      signal?.throwIfAborted();
      const reportDataDescription = await reportReader.prepareReportData(report);
      this.logger.debug(`Report data prepared for ${report.id}:`, reportDataDescription);
      reportWriter.setExecutionContext?.({
        runId: report.id,
        logger: reportRunLogger!,
      });
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

  /**
   * Wraps report execution with lifecycle management and cleanup.
   *
   * Ensures proper resource cleanup and status persistence even if execution fails.
   *
   * Steps:
   * 1. Generates unique process ID for tracking
   * 2. Registers process for graceful shutdown
   * 3. Actualizes data mart schema
   * 4. Marks run as started
   * 5. Executes report data extraction
   * 6. Handles success/error/cancellation
   * 7. Always unregisters process in finally block
   *
   * @param reportRun - Report run domain model
   * @param signal - Optional AbortSignal for cancellation
   */
  private async executeReportRunWithCleanup(
    reportRun: ReportRun,
    signal?: AbortSignal
  ): Promise<void> {
    const processId = this.generateProcessId(reportRun.getReportId());
    const reportRunLogger = createReportRunLogger(this.systemTimeService);

    try {
      this.gracefulShutdownService.registerActiveProcess(processId);
      this.availableDestinationTypesService.verifyIsAllowed(
        reportRun.getReport().dataDestination.type
      );
      await this.actualizeSchemaInDataMart(reportRun.getDataMart());
      await this.reportRunService.markAsStarted(reportRun);
      this.logger.log(`Report ${reportRun.getReportId()} execution started`);
      await this.executeReport(reportRun.getReport(), signal, reportRunLogger);
      const { logs, errors } = reportRunLogger.asArrays();
      await this.handleReportRunSuccess(reportRun, logs, errors);
    } catch (error) {
      reportRunLogger.error(error);
      const { logs, errors } = reportRunLogger.asArrays();
      await this.handleReportRunError(reportRun, error as Error, logs, errors);
    } finally {
      this.gracefulShutdownService.unregisterActiveProcess(processId);
    }
  }

  /**
   * Validates that system can start new report runs.
   * @throws BusinessViolationException if system is in shutdown mode
   */
  private validateCanRun() {
    if (this.gracefulShutdownService.isInShutdownMode()) {
      throw new BusinessViolationException(
        'Application is shutting down, cannot start new reports'
      );
    }
  }

  /**
   * Generates unique process ID for graceful shutdown tracking.
   * Format: report-{reportId}-{timestamp}-{random}
   *
   * @param reportId - Report identifier
   * @returns Unique process ID
   */
  private generateProcessId(reportId: string): string {
    const timestamp = this.systemTimeService.now();
    const random = Math.random().toString(36).substring(2, 11);
    return `report-${reportId}-${timestamp}-${random}`;
  }

  /**
   * Actualizes (refreshes) data mart schema before execution.
   * Ensures report reads from latest table structure.
   *
   * @param dataMart - DataMart entity to actualize
   */
  private async actualizeSchemaInDataMart(dataMart: DataMart): Promise<void> {
    await this.dataMartService.actualizeSchemaInEntity(dataMart);
    await this.dataMartService.save(dataMart);
  }

  /**
   * Handles successful report run completion.
   * Marks as success and persists results.
   *
   * @param reportRun - Completed report run
   * @param logs - Structured logs collected during the run
   * @param errors - Structured errors collected during the run
   */
  private async handleReportRunSuccess(
    reportRun: ReportRun,
    logs: string[] = [],
    errors: string[] = []
  ): Promise<void> {
    reportRun.markAsSuccess();

    const saved = await this.saveReportRunResultSafely(reportRun, logs, errors);
    if (saved) {
      this.logger.log(`Report ${reportRun.getReportId()} completed successfully`);
    }
  }

  /**
   * Handles report run error or cancellation.
   *
   * Distinguishes between:
   * - AbortError: User/system cancellation -> marks as CANCELLED
   * - Other errors: Execution failure -> marks as FAILED with error message
   *
   * @param reportRun - Failed or cancelled report run
   * @param error - Error that occurred
   * @param logs - Structured logs collected before failure
   * @param errors - Structured errors including the failure reason
   */
  private async handleReportRunError(
    reportRun: ReportRun,
    error: Error,
    logs: string[] = [],
    errors: string[] = []
  ): Promise<void> {
    if (error.name === ERROR_NAMES.ABORT) {
      reportRun.markAsCancelled();
      this.logger.warn(`Report ${reportRun.getReportId()} was cancelled by user`);
    } else if (error instanceof BusinessViolationException) {
      reportRun.markAsFailed(error);
      this.logger.warn(`Report ${reportRun.getReportId()} execution failed: ${error.message}`);
    } else {
      reportRun.markAsFailed(error);
      this.logger.error(`Report ${reportRun.getReportId()} execution failed:`, error);
    }
    await this.saveReportRunResultSafely(reportRun, logs, errors);
  }

  /**
   * Attempts to save report run results to the database.
   * If save fails, logs the error but does not throw to prevent losing the in-memory state.
   *
   * TODO: Implement proper error handling strategy (retry mechanism, dead letter queue, etc.)
   *
   * @returns true if saved successfully, false otherwise
   */
  private async saveReportRunResultSafely(
    reportRun: ReportRun,
    logs: string[] = [],
    errors: string[] = []
  ): Promise<boolean> {
    try {
      await this.reportRunService.finish(reportRun, { logs, errors });
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
