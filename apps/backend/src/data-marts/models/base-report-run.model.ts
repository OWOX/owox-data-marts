import { ProjectOperationBlockedException } from '../../common/exceptions/project-operation-blocked.exception';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMart } from '../entities/data-mart.entity';
import { Report } from '../entities/report.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { ReportRunStatus } from '../enums/report-run-status.enum';

/**
 * Base domain model for report run execution.
 *
 * This class encapsulates the business logic for managing report execution state,
 * coordinating changes between Report and DataMartRun entities.
 * It ensures atomic updates of related entities and provides a clean API for status management.
 *
 * Design decisions:
 * - Returns mutable entity references (getReport, getDataMartRun) for TypeORM persistence
 * - Coordinates state changes between Report and DataMartRun to maintain consistency
 * - Lives within a single use case scope (created -> executed -> finished)
 *
 * @abstract Extended by specific report run types (ReportRun, LookerStudioReportRun)
 */
export abstract class BaseReportRun {
  protected constructor(
    protected readonly report: Report,
    protected readonly dataMartRun: DataMartRun
  ) {
    if (!report) {
      throw new Error('Report is required');
    }
    if (!dataMartRun) {
      throw new Error('DataMartRun is required');
    }
  }

  /**
   * Returns the associated DataMartRun entity.
   * @returns Mutable entity reference for persistence operations
   */
  getDataMartRun(): DataMartRun {
    return this.dataMartRun;
  }

  /**
   * Returns the associated Report entity.
   * @returns Mutable entity reference for persistence operations
   */
  getReport(): Report {
    return this.report;
  }

  /**
   * Returns the report identifier.
   * @returns Report ID
   */
  getReportId(): string {
    return this.report.id;
  }

  /**
   * Returns the associated DataMart entity.
   * @returns DataMart entity from the report
   */
  getDataMart(): DataMart {
    return this.report.dataMart;
  }

  /**
   * Returns the last error message if the report run failed.
   * @returns Error message or undefined if no error occurred
   */
  getReportError(): string | undefined {
    return this.report.lastRunError;
  }

  /**
   * Checks if the report run completed successfully.
   * @returns true if status is SUCCESS, false otherwise
   */
  isSuccess(): boolean {
    return this.report.lastRunStatus === ReportRunStatus.SUCCESS;
  }

  /**
   * Marks the report run as successfully completed.
   * Updates both Report and DataMartRun statuses atomically.
   * Clears any previous error message.
   */
  markAsSuccess(): void {
    this.report.lastRunStatus = ReportRunStatus.SUCCESS;
    this.report.lastRunError = undefined;
    this.dataMartRun.status = DataMartRunStatus.SUCCESS;
  }

  /**
   * Marks the report run as unsuccessfully completed.
   * Determines the appropriate error status based on the provided error.
   * Updates both Report and DataMartRun statuses atomically.
   * Appends error to the errors array to preserve error history.
   *
   * @param error - Error object or error message string
   */
  markAsUnsuccessful(error: Error | string): void {
    if (error instanceof ProjectOperationBlockedException) {
      this.report.lastRunStatus = ReportRunStatus.RESTRICTED;
      this.dataMartRun.status = DataMartRunStatus.RESTRICTED;
    } else {
      this.report.lastRunStatus = ReportRunStatus.ERROR;
      this.dataMartRun.status = DataMartRunStatus.FAILED;
    }

    const errorString = error instanceof Error ? error.message : error;
    const errorEntry = JSON.stringify({
      type: 'error',
      at: new Date().toISOString(),
      error: errorString,
    });

    this.report.lastRunError = errorString;
    this.dataMartRun.errors = [...(this.dataMartRun.errors || []), errorEntry];
  }
}
