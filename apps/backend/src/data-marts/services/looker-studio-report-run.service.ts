import { Injectable, Logger } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { DataMartRunService } from './data-mart-run.service';
import { ReportService } from './report.service';
import { RunType } from '../../common/scheduler/shared/types';
import { Report } from '../entities/report.entity';
import { LookerStudioReportRun } from '../models/looker-studio-report-run.model';
import { ReportRunStatus } from '../enums/report-run-status.enum';

@Injectable()
export class LookerStudioReportRunService {
  private readonly logger = new Logger(LookerStudioReportRunService.name);

  constructor(
    private readonly reportService: ReportService,
    private readonly dataMartRunService: DataMartRunService
  ) {}

  async create(report: Report): Promise<LookerStudioReportRun | null> {
    try {
      const dataMartRun = await this.dataMartRunService.createAndMarkReportRunAsStarted(report, {
        createdById: report.createdById,
        runType: RunType.manual,
      });

      return LookerStudioReportRun.create(report, dataMartRun);
    } catch (error) {
      this.logger.error(`Failed to create run for report ${report.id}`, error);
      return null;
    }
  }

  @Transactional()
  async finish(reportRun: LookerStudioReportRun): Promise<void> {
    await this.dataMartRunService.markReportRunAsFinished(reportRun.dataMartRun);

    if (reportRun.isSuccess()) {
      await this.reportService.updateRunStatus(
        reportRun.getReportId(),
        reportRun.getReportStatus() || ReportRunStatus.SUCCESS
      );
    } else {
      await this.reportService.updateRunStatus(
        reportRun.getReportId(),
        reportRun.getReportStatus() || ReportRunStatus.ERROR,
        reportRun.getReportError()
      );
    }
  }
}
