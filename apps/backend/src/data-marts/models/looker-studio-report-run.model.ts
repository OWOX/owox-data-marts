import { DataMartRun } from '../entities/data-mart-run.entity';
import { Report } from '../entities/report.entity';
import { ReportRunStatus } from '../enums/report-run-status.enum';
import { BaseReportRun } from './base-report-run.model';

export class LookerStudioReportRun extends BaseReportRun {
  private constructor(report: Report, dataMartRun: DataMartRun) {
    super(report, dataMartRun);
  }

  static create(report: Report, dataMartRun: DataMartRun): LookerStudioReportRun {
    return new LookerStudioReportRun(report, dataMartRun);
  }

  getFinalReportStatus(): ReportRunStatus {
    return this.report.lastRunStatus ?? ReportRunStatus.SUCCESS;
  }

  getFinalReportStatusWithError(): { status: ReportRunStatus; error?: string } {
    const status = this.report.lastRunStatus ?? ReportRunStatus.ERROR;
    return {
      status,
      error: this.report.lastRunError,
    };
  }

  isSuccess(): boolean {
    return this.report.lastRunStatus === ReportRunStatus.SUCCESS;
  }
}
