import { Injectable, Logger } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { DataMartRunService } from './data-mart-run.service';
import { ReportService } from './report.service';
import { RunType } from '../../common/scheduler/shared/types';
import { Report } from '../entities/report.entity';
import { LookerStudioReportRun } from '../models/looker-studio-report-run.model';

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
    await this.dataMartRunService.markReportRunAsFinished(reportRun.getDataMartRun());

    if (reportRun.isSuccess()) {
      const status = reportRun.getFinalReportStatus();
      await this.reportService.updateRunStatus(reportRun.getReportId(), status);
    } else {
      const { status, error } = reportRun.getFinalReportStatusWithError();
      await this.reportService.updateRunStatus(reportRun.getReportId(), status, error);
    }
  }
}
