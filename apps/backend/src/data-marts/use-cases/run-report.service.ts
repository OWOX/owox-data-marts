import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { ReportRunStatus } from '../enums/report-run-status.enum';
import { DataMartService } from '../services/data-mart.service';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunService } from '../services/data-mart-run.service';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import { Transactional } from 'typeorm-transactional';
import { DataMart } from '../entities/data-mart.entity';

@Injectable()
export class RunReportService {
  private readonly logger = new Logger(RunReportService.name);

  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    @InjectRepository(DataMartRun)
    private readonly dataMartRunRepository: Repository<DataMartRun>,
    @Inject(DATA_STORAGE_REPORT_READER_RESOLVER)
    private readonly reportReaderResolver: TypeResolver<DataStorageType, DataStorageReportReader>,
    @Inject(DATA_DESTINATION_REPORT_WRITER_RESOLVER)
    private readonly reportWriterResolver: TypeResolver<
      DataDestinationType,
      DataDestinationReportWriter
    >,
    private readonly dataMartService: DataMartService,
    private readonly dataMartRunService: DataMartRunService,
    private readonly gracefulShutdownService: GracefulShutdownService,
    private readonly systemTimeService: SystemTimeService
  ) {}

  runInBackground(command: RunReportCommand): void {
    this.run(command).catch(error => {
      this.logger.error(`Error running report ${command.reportId} asynchronously:`, error);
    });
  }

  async run(command: RunReportCommand, signal?: AbortSignal): Promise<void> {
    if (this.gracefulShutdownService.isInShutdownMode()) {
      throw new BusinessViolationException(
        'Application is shutting down, cannot start new reports'
      );
    }

    this.logger.log(`Staring report run ${command.reportId}`);

    const result = await this.startReportRunTransaction(command);
    if (!result) {
      return;
    }
    const { report, dataMartRun } = result;

    const processId = `report-${command.reportId}-${this.systemTimeService.now()}-${Math.random().toString(36).substring(2, 11)}`;

    try {
      this.gracefulShutdownService.registerActiveProcess(processId);

      await this.actualizeSchemaInDataMart(report.dataMart);

      await this.dataMartRunService.markReportRunAsStarted(dataMartRun);

      await this.executeReport(report, signal);

      report.lastRunStatus = ReportRunStatus.SUCCESS;
      dataMartRun.status = DataMartRunStatus.SUCCESS;

      const saved = await this.saveReportRunResultSafely(report, dataMartRun);
      if (saved) {
        this.logger.log(`Report run ${report.id} finished successfully`);
      } else {
        this.logger.warn(`Report run ${report.id} completed but failed to save results`);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        report.lastRunStatus = ReportRunStatus.CANCELLED;
        report.lastRunError = 'Report run was cancelled by user';
        dataMartRun.status = DataMartRunStatus.CANCELLED;

        this.logger.log(`Report run ${report.id} was aborted by user.`);
      } else {
        const errorString = error.toString();
        report.lastRunStatus = ReportRunStatus.ERROR;
        report.lastRunError = errorString;
        dataMartRun.status = DataMartRunStatus.FAILED;
        dataMartRun.errors = [errorString];

        this.logger.error(`Error running report ${report.id}:`, error);
      }

      await this.saveReportRunResultSafely(report, dataMartRun);
    } finally {
      this.gracefulShutdownService.unregisterActiveProcess(processId);
    }
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

  private async actualizeSchemaInDataMart(dataMart: DataMart): Promise<void> {
    await this.dataMartService.actualizeSchemaInEntity(dataMart);
    await this.dataMartService.save(dataMart);
  }

  private async saveReportRunResultSafely(
    report: Report,
    dataMartRun: DataMartRun
  ): Promise<boolean> {
    try {
      await this.finishReportRunTransaction(report, dataMartRun);
      return true;
    } catch (saveError) {
      this.logger.error(`Failed to save report status for ${report.id}: `, saveError);
    }
    return false;
  }

  @Transactional()
  private async startReportRunTransaction(
    command: RunReportCommand
  ): Promise<{ report: Report; dataMartRun: DataMartRun } | null> {
    const report = await this.reportRepository.findOne({
      where: { id: command.reportId },
      relations: ['dataMart', 'dataDestination'],
    });

    if (!report) {
      throw new BusinessViolationException(`Report with id ${command.reportId} not found`);
    }

    if (report.lastRunStatus === ReportRunStatus.RUNNING) {
      return null;
      // throw new BusinessViolationException('Report is already running');
    }

    const runAt = this.systemTimeService.now();
    report.lastRunStatus = ReportRunStatus.RUNNING;
    report.lastRunAt = runAt;
    report.runsCount += 1;
    delete report.lastRunError;

    try {
      await this.reportRepository.save(report);

      const dataMartRun = await this.dataMartRunService.createAndMarkReportRunAsPending(report, {
        createdById: command.userId,
        runType: command.runType,
      });

      return { report, dataMartRun };
    } catch (error) {
      if (error.name === 'OptimisticLockVersionMismatchError') {
        this.logger.log(`Report ${command.reportId} already taken by another instance`);
        return null;
      }
      throw error;
    }
  }

  @Transactional()
  private async finishReportRunTransaction(report: Report, dataMartRun: DataMartRun) {
    await this.reportRepository.save(report);
    await this.dataMartRunService.markReportRunAsFinished(dataMartRun);
  }
}
