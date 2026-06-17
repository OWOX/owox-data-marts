import { Inject, Injectable, Logger } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { GracefulShutdownService } from '../../common/scheduler/services/graceful-shutdown.service';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import { AvailableDestinationTypesService } from '../data-destination-types/available-destination-types.service';
import { DATA_DESTINATION_REPORT_WRITER_RESOLVER } from '../data-destination-types/data-destination-providers';
import {
  DataDestinationType,
  isEmailBasedDataDestinationType,
} from '../data-destination-types/enums/data-destination-type.enum';
import {
  DataDestinationReportWriter,
  ReportWriteFinalizeResult,
} from '../data-destination-types/interfaces/data-destination-report-writer.interface';
import { DATA_STORAGE_REPORT_READER_RESOLVER } from '../data-storage-types/data-storage-providers';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataStorageReportReader } from '../data-storage-types/interfaces/data-storage-report-reader.interface';
import { RunReportCommand } from '../dto/domain/run-report.command';
import { RunType } from '../../common/scheduler/shared/types';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { Report } from '../entities/report.entity';
import { ReportRun } from '../models/report-run.model';
import { logBlendedSqlIfNeeded } from '../report-run-logging/log-blended-sql';
import { createReportRunLogger, ReportRunLogger } from '../report-run-logging/report-run-logger';
import {
  BlendableSchemaAccessor,
  resolveBlendableSchemaAccessor,
} from '../services/blendable-schema.service';
import { BlendedReportDataService } from '../services/blended-report-data.service';
import { DataMartService } from '../services/data-mart.service';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import { ProjectBalanceService } from '../services/project-balance.service';
import { ReportRunService } from '../services/report-run.service';
import { ReportRunTriggerService } from '../services/report-run-trigger.service';
import {
  ReportExecutionPolicy,
  ReportExecutionPolicyResolver,
} from './report-execution-policy.resolver';
import { ReportAccessService } from '../services/report-access.service';
import { ReportSqlComposerService } from '../services/report-sql-composer.service';
import { SqlParameter } from '../data-storage-types/utils/sql-clause-renderer';
import { ConsumptionTrackingService } from '../services/consumption-tracking.service';

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
    private readonly availableDestinationTypesService: AvailableDestinationTypesService,
    private readonly projectBalanceService: ProjectBalanceService,
    private readonly reportExecutionPolicyResolver: ReportExecutionPolicyResolver,
    private readonly reportRunTriggerService: ReportRunTriggerService,
    private readonly reportAccessService: ReportAccessService,
    private readonly blendedReportDataService: BlendedReportDataService,
    private readonly reportSqlComposerService: ReportSqlComposerService,
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    private readonly consumptionTrackingService: ConsumptionTrackingService
  ) {}

  /**
   * Creates a pending report run and enqueues it via trigger for worker processing.
   *
   * Auth gating runs OUTSIDE the transactional boundary so a 403 doesn't open and
   * roll back a database transaction. The actual createPending + createTrigger work
   * stays atomic via `enqueueReportRun`.
   *
   * @param command - Report run command with reportId, userId, runType
   * @param signal - Unused, kept for backward compatibility with scheduled processors
   */
  async run(command: RunReportCommand, _signal?: AbortSignal): Promise<void> {
    this.validateCanRun();

    if (command.runType === RunType.manual) {
      await this.reportAccessService.checkOperateAccess(
        command.userId,
        command.roles,
        command.reportId,
        command.projectId
      );
    }

    await this.enqueueReportRun(command);
  }

  @Transactional()
  private async enqueueReportRun(command: RunReportCommand): Promise<void> {
    this.logger.log(`Creating report run trigger for report ${command.reportId}`);

    const reportRun = await this.reportRunService.createPending(command);
    if (!reportRun) {
      this.logger.log(
        `Report ${command.reportId} is already running or pending, skipping execution`
      );
      return;
    }

    await this.reportRunTriggerService.createTrigger({
      reportId: command.reportId,
      createdById: command.userId,
      projectId: reportRun.getDataMart().projectId,
      dataMartRunId: reportRun.getDataMartRun().id,
      runType: command.runType,
    });
  }

  /**
   * Execute a pre-created report run. Called by ReportRunTriggerHandler on worker.
   *
   * @param dataMartRunId - The ID of the DataMartRun to execute
   * @param expectedProjectId - The projectId from the trigger, used to validate ownership
   * @param signal - Optional AbortSignal for cancellation
   */
  async executeExistingRun(
    dataMartRunId: string,
    expectedProjectId: string,
    runByUserId: string,
    signal?: AbortSignal
  ): Promise<void> {
    const reportRun = await this.reportRunService.loadByDataMartRunId(dataMartRunId);
    if (!reportRun) {
      throw new Error(`Report run not found for dataMartRunId: ${dataMartRunId}`);
    }

    const actualProjectId = reportRun.getDataMart().projectId;
    if (actualProjectId !== expectedProjectId) {
      throw new Error(
        `Project mismatch: report belongs to project ${actualProjectId} ` +
          `but trigger was for project ${expectedProjectId}`
      );
    }

    await this.executeReportRunWithCleanup(reportRun, runByUserId, signal);
  }

  private resolveAccessor(userId: string, projectId: string): Promise<BlendableSchemaAccessor> {
    return resolveBlendableSchemaAccessor(this.idpProjectionsFacade, projectId, userId);
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
    accessor: BlendableSchemaAccessor,
    signal?: AbortSignal,
    reportRunLogger?: ReportRunLogger,
    dataMartRun?: DataMartRun
  ): Promise<ReportWriteFinalizeResult | undefined> {
    signal?.throwIfAborted();
    const { dataMart, dataDestination } = report;
    const executionPolicy = this.reportExecutionPolicyResolver.resolve(report);
    let reportReader: DataStorageReportReader | null = null;
    let reportWriter: DataDestinationReportWriter | null = null;
    let finalizeResult: ReportWriteFinalizeResult | undefined;
    let processingError: Error | undefined = undefined;
    try {
      signal?.throwIfAborted();
      await this.projectBalanceService.verifyCanPerformOperations(dataMart.projectId);

      // Resolve blending decision up front. When the report has a column
      // config, this produces either a pre-built blended SQL (for cross-DM
      // joins) or a column filter (for native-only projections). Readers
      // receive the result via PrepareReportDataOptions.
      const blendingDecision = await this.blendedReportDataService.resolveBlendingDecision(
        report,
        accessor
      );
      logBlendedSqlIfNeeded(blendingDecision, reportRunLogger);

      reportReader = await this.reportReaderResolver.resolve(dataMart.storage.type);
      reportWriter = await this.reportWriterResolver.resolve(dataDestination.type);

      let sqlOverride: string | undefined;
      let sqlOverrideParams: SqlParameter[] | undefined;
      if (blendingDecision.needsBlending) {
        sqlOverride = blendingDecision.blendedSql;
        sqlOverrideParams = blendingDecision.params;
      } else if (
        (report.filterConfig?.length ?? 0) > 0 ||
        (report.sortConfig?.length ?? 0) > 0 ||
        report.limitConfig != null
      ) {
        // Non-blended report with output controls — compose the full SQL + params here so
        // the reader doesn't need to know about output-controls semantics.
        const composed = await this.reportSqlComposerService.compose(report, accessor);
        sqlOverride = composed.sql;
        sqlOverrideParams = composed.params;
      }

      // Persist the exact executed SQL (output controls applied, params inlined as
      // literals — same render as the generated-SQL preview) onto the run record so
      // Run History can show it. Only when an override exists (output controls or
      // blending); a plain report's executed SQL == the raw definition sqlQuery.
      if (sqlOverride && dataMartRun?.reportDefinition) {
        dataMartRun.reportDefinition.executionSqlQuery =
          this.reportSqlComposerService.inlineStaticSql(
            dataMart.storage.type,
            sqlOverride,
            sqlOverrideParams
          );
      }

      const reportDataDescription = await reportReader.prepareReportData(report, {
        sqlOverride,
        sqlOverrideParams,
        columnFilter: blendingDecision.columnFilter,
        blendedDataHeaders: blendingDecision.blendedDataHeaders,
      });
      this.logger.debug(`Report data prepared for ${report.id}:`, reportDataDescription);
      reportWriter.setExecutionContext?.({
        runId: report.id,
        logger: reportRunLogger!,
      });
      await reportWriter.prepareToWriteReport(report, reportDataDescription);
      for await (const batch of this.readReportBatches(
        reportReader,
        executionPolicy,
        report.id,
        signal
      )) {
        signal?.throwIfAborted();
        await reportWriter.writeReportDataBatch(batch);
        this.logger.debug(`${batch.dataRows.length} data rows written for report ${report.id}`);
      }
    } catch (error) {
      processingError = error;
      throw error;
    } finally {
      if (reportWriter) {
        finalizeResult =
          (await reportWriter.finalize(processingError, {
            mainRowsTruncationInfo: executionPolicy.getRowsTruncationInfo(),
          })) ?? undefined;
      }
      if (reportReader) {
        await reportReader.finalize();
      }
    }
    return finalizeResult;
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
    runByUserId: string,
    signal?: AbortSignal
  ): Promise<void> {
    const processId = this.generateProcessId(reportRun.getReportId());
    const reportRunLogger = createReportRunLogger(this.systemTimeService);

    try {
      this.gracefulShutdownService.registerActiveProcess(processId);
      const accessor = await this.resolveAccessor(runByUserId, reportRun.getDataMart().projectId);
      this.availableDestinationTypesService.verifyIsAllowed(
        reportRun.getReport().dataDestination.type
      );
      await this.actualizeSchemaInDataMart(reportRun.getDataMart());
      await this.reportRunService.markAsStarted(reportRun);
      this.logger.log(`Report ${reportRun.getReportId()} execution started`);
      const finalizeResult = await this.executeReport(
        reportRun.getReport(),
        accessor,
        signal,
        reportRunLogger,
        reportRun.getDataMartRun()
      );
      const { logs, errors } = reportRunLogger.asArrays();
      await this.handleReportRunSuccess(reportRun, logs, errors, finalizeResult);
    } catch (error) {
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

  private async readReportDataBatchWithPolicy(
    reportReader: DataStorageReportReader,
    nextReportDataBatch: string | undefined | null,
    executionPolicy: ReportExecutionPolicy
  ) {
    const batchId = nextReportDataBatch ?? undefined;
    const maxDataRows = executionPolicy.getMaxDataRowsPerBatch();
    if (maxDataRows == null) {
      return reportReader.readReportDataBatch(batchId);
    }

    return reportReader.readReportDataBatch(batchId, maxDataRows);
  }

  private logPolicyStop(reportId: string, executionPolicy: ReportExecutionPolicy): void {
    const stopReason = executionPolicy.getStopReason();
    if (!stopReason) {
      return;
    }

    this.logger.debug(`${stopReason} for report ${reportId}`);
  }

  private async *readReportBatches(
    reportReader: DataStorageReportReader,
    executionPolicy: ReportExecutionPolicy,
    reportId: string,
    signal?: AbortSignal
  ): AsyncGenerator<Awaited<ReturnType<RunReportService['readReportDataBatchWithPolicy']>>> {
    let nextReportDataBatch: string | undefined | null = undefined;

    while (true) {
      signal?.throwIfAborted();
      if (!executionPolicy.canReadNextBatch()) {
        this.logPolicyStop(reportId, executionPolicy);
        return;
      }

      const readBatch = await this.readReportDataBatchWithPolicy(
        reportReader,
        nextReportDataBatch,
        executionPolicy
      );
      const batch = executionPolicy.mapReadBatch(readBatch);
      yield batch;

      if (executionPolicy.shouldStopAfterBatch()) {
        this.logPolicyStop(reportId, executionPolicy);
        return;
      }

      nextReportDataBatch = batch.nextDataBatchId;
      if (!nextReportDataBatch) {
        return;
      }
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
    errors: string[] = [],
    finalizeResult?: ReportWriteFinalizeResult
  ): Promise<void> {
    reportRun.markAsSuccess();

    const saved = await this.saveReportRunResultSafely(reportRun, logs, errors);
    if (!saved) {
      return;
    }

    this.logger.log(`Report ${reportRun.getReportId()} completed successfully`);
    await this.registerReportRunConsumption(reportRun.getReport(), finalizeResult);
  }

  private async registerReportRunConsumption(
    report: Report,
    finalizeResult?: ReportWriteFinalizeResult
  ): Promise<void> {
    try {
      if (report.dataDestination.type === DataDestinationType.GOOGLE_SHEETS) {
        const sheetsDetails = finalizeResult?.consumption?.googleSheets;
        if (!sheetsDetails) {
          this.logger.warn(
            `Skipping Google Sheets report consumption for ${report.id}: missing finalize metadata`
          );
          return;
        }

        await this.consumptionTrackingService.registerSheetsReportRunConsumption(
          report,
          sheetsDetails
        );
        return;
      }

      if (isEmailBasedDataDestinationType(report.dataDestination.type)) {
        await this.consumptionTrackingService.registerEmailBasedReportRunConsumption(report);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to register report consumption for ${report.id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
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
      reportRun.markAsUnsuccessful(error);
      this.logger.warn(`Report ${reportRun.getReportId()} execution failed: ${error.message}`);
    } else {
      reportRun.markAsUnsuccessful(error);
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
