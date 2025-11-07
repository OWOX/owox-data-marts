import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { Report } from '../entities/report.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { ReportRunStatus } from '../enums/report-run-status.enum';
import { BaseReportRun } from './base-report-run.model';

export class ReportRun extends BaseReportRun {
  private constructor(report: Report, dataMartRun: DataMartRun) {
    super(report, dataMartRun);
  }

  static create(report: Report, dataMartRun: DataMartRun): ReportRun {
    return new ReportRun(report, dataMartRun);
  }

  static canStart(report: Report): boolean {
    return report.lastRunStatus !== ReportRunStatus.RUNNING;
  }

  static prepareForStart(report: Report, runAt: Date): void {
    if (!this.canStart(report)) {
      throw new BusinessViolationException('Report run is already running');
    }

    report.lastRunStatus = ReportRunStatus.RUNNING;
    report.lastRunAt = runAt;
    report.runsCount += 1;
    delete report.lastRunError;
  }

  markAsCancelled(): void {
    this.report.lastRunStatus = ReportRunStatus.CANCELLED;
    this.dataMartRun.status = DataMartRunStatus.CANCELLED;
  }
}
