import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMart } from '../entities/data-mart.entity';
import { Report } from '../entities/report.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { ReportRunStatus } from '../enums/report-run-status.enum';

export abstract class BaseReportRun {
  protected constructor(
    protected readonly report: Report,
    protected readonly dataMartRun: DataMartRun
  ) {}

  getDataMartRun(): DataMartRun {
    return this.dataMartRun;
  }

  getReport(): Report {
    return this.report;
  }

  getReportId(): string {
    return this.report.id;
  }

  getDataMart(): DataMart {
    return this.report.dataMart;
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
