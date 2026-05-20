import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { GracefulShutdownService } from '../../common/scheduler/services/graceful-shutdown.service';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import { AvailableDestinationTypesService } from '../data-destination-types/available-destination-types.service';
import { DATA_DESTINATION_REPORT_WRITER_RESOLVER } from '../data-destination-types/data-destination-providers';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { DataDestinationReportWriter } from '../data-destination-types/interfaces/data-destination-report-writer.interface';
import { DATA_STORAGE_REPORT_READER_RESOLVER } from '../data-storage-types/data-storage-providers';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataStorageReportReader } from '../data-storage-types/interfaces/data-storage-report-reader.interface';
import { RunReportCommand } from '../dto/domain/run-report.command';
import { RunType } from '../../common/scheduler/shared/types';
import { DataMart } from '../entities/data-mart.entity';
import { Report } from '../entities/report.entity';
import { ReportRun } from '../models/report-run.model';
import { logBlendedSqlIfNeeded } from '../report-run-logging/log-blended-sql';
import { createReportRunLogger, ReportRunLogger } from '../report-run-logging/report-run-logger';
import { BlendedReportDataService } from '../services/blended-report-data.service';
import { DataMartService } from '../services/data-mart.service';
import { ProjectBalanceService } from '../services/project-balance.service';
import { ReportRunService } from '../services/report-run.service';
import { ReportRunTriggerService } from '../services/report-run-trigger.service';
import {
  ReportExecutionPolicy,
  ReportExecutionPolicyResolver,
} from './report-execution-policy.resolver';
import { ReportSqlComposerService } from '../services/report-sql-composer.service';
import { SqlParameter } from '../data-storage-types/utils/sql-clause-renderer';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ReportRunAccessValidatorService } from '../services/report-run-access-validator.service';

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
    private readonly reportRunService: ReportRunService,
    private readonly availableDestinationTypesService: AvailableDestinationTypesService,
    private readonly projectBalanceService: ProjectBalanceService,
    private readonly reportExecutionPolicyResolver: ReportExecutionPolicyResolver,
    private readonly reportRunTriggerService: ReportRunTriggerService,
    private readonly blendedReportDataService: BlendedReportDataService,
    private readonly reportSqlComposerService: ReportSqlComposerService,
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly reportRunAccessValidatorService: ReportRunAccessValidatorService
  ) {}

  async run(command: RunReportCommand, _signal?: AbortSignal): Promise<void> {
    this.validateCanRun();

    const report = await this.reportRepository.findOne({
      where: { id: command.reportId, dataMart: { projectId: command.projectId } },
      relations: ['dataMart', 'dataDestination'],
    });
    if (!report) {
      throw new NotFoundException(`Report ${command.reportId} not found`);
    }

    const isManual = command.runType === RunType.manual;
    await this.reportRunAccessValidatorService.validate(
      report,
      command.userId,
      command.projectId,
      isManual ? 'Manual run' : 'Scheduled run',
      isManual ? command.roles : undefined
    );

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

  async executeExistingRun(
    dataMartRunId: string,
    expectedProjectId: string,
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

    await this.executeReportRunWithCleanup(reportRun, signal);
  }

  private async executeReport(
    report: Report,
    signal?: AbortSignal,
    reportRunLogger?: ReportRunLogger
  ): Promise<void> {
    signal?.throwIfAborted();
    const { dataMart, dataDestination } = report;
    const reportReader = await this.reportReaderResolver.resolve(dataMart.storage.type);
    const reportWriter = await this.reportWriterResolver.resolve(dataDestination.type);
    const executionPolicy = this.reportExecutionPolicyResolver.resolve(report);
    let processingError: Error | undefined = undefined;
    try {
      signal?.throwIfAborted();
      await this.projectBalanceService.verifyCanPerformOperations(dataMart.projectId);

      // Resolve blending decision up front. When the report has a column
      // config, this produces either a pre-built blended SQL (for cross-DM
      // joins) or a column filter (for native-only projections). Readers
      // receive the result via PrepareReportDataOptions.
      const blendingDecision = await this.blendedReportDataService.resolveBlendingDecision(report);
      logBlendedSqlIfNeeded(blendingDecision, reportRunLogger);

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
        const composed = await this.reportSqlComposerService.compose(report);
        sqlOverride = composed.sql;
        sqlOverrideParams = composed.params;
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
      await reportWriter.finalize(processingError, {
        mainRowsTruncationInfo: executionPolicy.getRowsTruncationInfo(),
      });
      await reportReader.finalize();
    }
  }

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
      const { logs, errors } = reportRunLogger.asArrays();
      await this.handleReportRunError(reportRun, error as Error, logs, errors);
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

  private generateProcessId(reportId: string): string {
    const timestamp = this.systemTimeService.now();
    const random = Math.random().toString(36).substring(2, 11);
    return `report-${reportId}-${timestamp}-${random}`;
  }

  private async actualizeSchemaInDataMart(dataMart: DataMart): Promise<void> {
    await this.dataMartService.actualizeSchemaInEntity(dataMart);
    await this.dataMartService.save(dataMart);
  }

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

  // TODO: Implement proper error handling strategy (retry mechanism, dead letter queue, etc.)
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
