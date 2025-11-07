import { DataMartRun } from '../entities/data-mart-run.entity';
import { Report } from '../entities/report.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { ReportRunStatus } from '../enums/report-run-status.enum';

export class LookerStudioReportRun {
  private constructor(
    public readonly report: Report,
    public readonly dataMartRun: DataMartRun
  ) {}

  static create(report: Report, dataMartRun: DataMartRun): LookerStudioReportRun {
    return new LookerStudioReportRun(report, dataMartRun);
  }

  getReportId() {
    return this.report.id;
  }

  getReportStatus() {
    return this.report.lastRunStatus;
  }

  getReportError() {
    return this.report.lastRunError;
  }

  isSuccess(): boolean {
    return this.report.lastRunStatus === ReportRunStatus.SUCCESS;
  }

  markAsSuccess(): void {
    this.report.lastRunStatus = ReportRunStatus.SUCCESS;
    this.dataMartRun.status = DataMartRunStatus.SUCCESS;
  }

  markAsFailed(error: Error | string): void {
    const errorString = error instanceof Error ? error.message : error;

    this.report.lastRunStatus = ReportRunStatus.ERROR;
    this.report.lastRunError = errorString;
    this.dataMartRun.status = DataMartRunStatus.FAILED;
    this.dataMartRun.errors = [errorString];
  }
}
