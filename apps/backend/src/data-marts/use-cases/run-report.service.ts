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
import { DataMartRun } from 'src/data-marts/entities/data-mart-run.entity';
import { DataMartRunStatus } from 'src/data-marts/enums/data-mart-run-status.enum';
import {
  DataMartRunService,
  ReportRunFinishContext,
} from 'src/data-marts/services/data-mart-run.service';

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
    private readonly gracefulShutdownService: GracefulShutdownService
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
    const report = await this.reportRepository.findOne({
      where: { id: command.reportId },
      relations: ['dataMart', 'dataDestination'],
    });

    if (!report) {
      throw new BusinessViolationException(`Report with id ${command.reportId} not found`);
    }

    if (report.lastRunStatus === ReportRunStatus.RUNNING) {
      throw new BusinessViolationException('Report is already running');
    }

    const processId = `report-${command.reportId}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    const runAt = new Date();
    report.lastRunStatus = ReportRunStatus.RUNNING;
    report.lastRunAt = runAt;
    report.runsCount += 1;
    delete report.lastRunError;

    //TODO: improve lock ?
    await this.reportRepository.save(report);

    // TODO: create new record in transaction with reportRepository
    const dataMartRun = await this.dataMartRunService.createReportRun(report, {
      createdById: command.userId,
      runType: command.runType,
    });

    const dataMartRunFinishContext: ReportRunFinishContext = { status: DataMartRunStatus.SUCCESS };

    try {
      this.gracefulShutdownService.registerActiveProcess(processId);

      // actualizing schemas before run
      await this.dataMartService.actualizeSchemaInEntity(report.dataMart);
      await this.dataMartService.save(report.dataMart);

      await this.dataMartRunService.startReportRun(dataMartRun);

      await this.executeReport(report, signal);

      report.lastRunStatus = ReportRunStatus.SUCCESS;

      this.logger.log(`Report run ${report.id} finished successfully`);
    } catch (error) {
      if (error.name === 'AbortError') {
        report.lastRunStatus = ReportRunStatus.CANCELLED;
        report.lastRunError = 'Report run was cancelled by user';

        dataMartRunFinishContext.status = DataMartRunStatus.CANCELLED;

        this.logger.log(`Report run ${report.id} was aborted by user.`);
      } else {
        const errorString = error.toString();
        report.lastRunStatus = ReportRunStatus.ERROR;
        report.lastRunError = errorString;

        dataMartRunFinishContext.status = DataMartRunStatus.FAILED;
        dataMartRunFinishContext.errors = [errorString];

        this.logger.error(`Error running report ${report.id}:`, error);
      }
    } finally {
      try {
        // TODO: save results in transaction
        await this.dataMartRunService.finishReportRun(dataMartRun, dataMartRunFinishContext);
        await this.reportRepository.save(report);
      } catch (saveError) {
        this.logger.error(`Failed to save report status for ${report.id}:`, saveError);
      } finally {
        this.gracefulShutdownService.unregisterActiveProcess(processId);
      }
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
}
