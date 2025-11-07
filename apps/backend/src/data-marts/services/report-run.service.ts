import { Injectable } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { ReportRun } from '../models/report-run.model';
import { DataMartRunService } from './data-mart-run.service';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import { RunReportCommand } from '../dto/domain/run-report.command';
import { ReportService } from './report.service';

const ERROR_NAMES = {
  OPTIMISTIC_LOCK: 'OptimisticLockVersionMismatchError',
} as const;

@Injectable()
export class ReportRunService {
  constructor(
    private readonly reportService: ReportService,
    private readonly dataMartRunService: DataMartRunService,
    private readonly systemTimeService: SystemTimeService
  ) {}

  @Transactional()
  async createPending(command: RunReportCommand): Promise<ReportRun | null> {
    const report = await this.reportService.getById(command.reportId);

    if (!ReportRun.canStart(report)) {
      return null;
    }

    ReportRun.prepareForStart(report, this.systemTimeService.now());

    try {
      await this.reportService.saveReport(report);

      const dataMartRun = await this.dataMartRunService.createAndMarkReportRunAsPending(report, {
        createdById: command.userId,
        runType: command.runType,
      });

      return ReportRun.create(report, dataMartRun);
    } catch (error) {
      if (error.name === ERROR_NAMES.OPTIMISTIC_LOCK) {
        return null;
      }
      throw error;
    }
  }

  async markAsStarted(reportRun: ReportRun): Promise<void> {
    await this.dataMartRunService.markReportRunAsStarted(reportRun.getDataMartRun());
  }

  @Transactional()
  async finish(reportRun: ReportRun): Promise<void> {
    await this.reportService.saveReport(reportRun.getReport());
    await this.dataMartRunService.markReportRunAsFinished(reportRun.getDataMartRun());
  }
}
