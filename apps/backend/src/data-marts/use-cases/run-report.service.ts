import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
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

@Injectable()
export class RunReportService {
  private readonly logger = new Logger(RunReportService.name);

  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    @Inject(DATA_STORAGE_REPORT_READER_RESOLVER)
    private readonly reportReaderResolver: TypeResolver<DataStorageType, DataStorageReportReader>,
    @Inject(DATA_DESTINATION_REPORT_WRITER_RESOLVER)
    private readonly reportWriterResolver: TypeResolver<
      DataDestinationType,
      DataDestinationReportWriter
    >,
    private readonly dataMartService: DataMartService
  ) {}

  runInBackground(command: RunReportCommand): void {
    this.run(command).catch(error => {
      this.logger.error(`Error running report ${command.reportId} asynchronously:`, error);
    });
  }

  async run(command: RunReportCommand): Promise<void> {
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

    const runAt = new Date();
    report.lastRunStatus = ReportRunStatus.RUNNING;
    report.lastRunAt = runAt;
    report.runsCount += 1;
    delete report.lastRunError;
    await this.reportRepository.save(report);

    try {
      // actualizing schemas before run
      await this.dataMartService.actualizeSchemaInEntity(report.dataMart);
      await this.dataMartService.save(report.dataMart);

      await this.executeReport(report);
      report.lastRunStatus = ReportRunStatus.SUCCESS;
      this.logger.log(`Report run ${report.id} finished successfully`);
    } catch (error) {
      this.logger.error(`Error running report ${report.id}:`, error);
      report.lastRunStatus = ReportRunStatus.ERROR;
      report.lastRunError = error.toString();
    } finally {
      await this.reportRepository.save(report);
    }
  }

  private async executeReport(report: Report): Promise<void> {
    const { dataMart, dataDestination } = report;
    const reportReader = await this.reportReaderResolver.resolve(dataMart.storage.type);
    const reportWriter = await this.reportWriterResolver.resolve(dataDestination.type);
    try {
      const reportDataDescription = await reportReader.prepareReportData(report);
      this.logger.debug(`Report data prepared for ${report.id}:`, reportDataDescription);
      await reportWriter.prepareToWriteReport(report, reportDataDescription);
      let nextReportDataBatch: string | undefined | null = undefined;
      do {
        const batch = await reportReader.readReportDataBatch(nextReportDataBatch);
        await reportWriter.writeReportDataBatch(batch);
        nextReportDataBatch = batch.nextDataBatchId;
        this.logger.debug(`${batch.dataRows.length} data rows written for report ${report.id}`);
      } while (nextReportDataBatch);
    } finally {
      await reportWriter.finalize();
      await reportReader.finalize();
    }
  }
}
