import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMart } from '../entities/data-mart.entity';
import { Report } from '../entities/report.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { ReportRunStatus } from '../enums/report-run-status.enum';

export class ReportRun {
  private constructor(
    private readonly report: Report,
    private readonly dataMartRun: DataMartRun
  ) {}

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

  getDataMart(): DataMart {
    return this.report.dataMart;
  }

  getDataMartRun(): DataMartRun {
    return this.dataMartRun;
  }

  getReport(): Report {
    return this.report;
  }

  getReportId(): string {
    return this.report.id;
  }

  markAsSuccess(): void {
    this.report.lastRunStatus = ReportRunStatus.SUCCESS;
    this.dataMartRun.status = DataMartRunStatus.SUCCESS;
  }

  markAsCancelled(): void {
    this.report.lastRunStatus = ReportRunStatus.CANCELLED;
    this.dataMartRun.status = DataMartRunStatus.CANCELLED;
  }

  markAsFailed(error: Error | string): void {
    const errorString = error instanceof Error ? error.toString() : error;

    this.report.lastRunStatus = ReportRunStatus.ERROR;
    this.report.lastRunError = errorString;
    this.dataMartRun.status = DataMartRunStatus.FAILED;
    this.dataMartRun.errors = [errorString];
  }
}
