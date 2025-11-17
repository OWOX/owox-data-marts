import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { Report } from '../entities/report.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { ReportRunStatus } from '../enums/report-run-status.enum';
import { BaseReportRun } from './base-report-run.model';

const REPORT_RUN_ERROR_MESSAGES = {
  AlreadyRunning: 'Report run is already running',
} as const;

/**
 * Domain model for standard report run execution.
 *
 * Represents a single execution of a scheduled or manually triggered report.
 * Handles the complete lifecycle from initialization through completion or cancellation.
 *
 * Characteristics:
 * - Supports both scheduled and manual runs
 * - Can be cancelled by users or system shutdown
 * - Uses optimistic locking to prevent concurrent executions
 * - Creates DataMartRun in PENDING status, then moves to RUNNING
 *
 * Concurrency control:
 * - canStart() checks if report is already running
 * - initializeStarting() uses Report.version for optimistic locking
 * - Returns null on concurrent execution attempt (normal behavior)
 *
 * Lifecycle:
 * 1. Check if can start
 * 2. Create in PENDING status in transaction
 * 4. Mark as started (RUNNING)
 * 5. Execute report logic
 * 6. Finish (SUCCESS/ERROR/CANCELLED) in transaction
 *
 * @see ReportRunService
 * @see RunReportService
 */
export class ReportRun extends BaseReportRun {
  private constructor(report: Report, dataMartRun: DataMartRun) {
    super(report, dataMartRun);
  }

  /**
   * Creates a new report run instance.
   *
   * @param report - Report entity with loaded dataMart relation
   * @param dataMartRun - DataMartRun entity in PENDING status
   * @returns New ReportRun instance
   */
  static create(report: Report, dataMartRun: DataMartRun): ReportRun {
    return new ReportRun(report, dataMartRun);
  }

  /**
   * Checks if the report can start a new run.
   * Report cannot start if it's already in RUNNING status.
   *
   * @param report - Report entity to check
   * @returns true if report can start, false if already running
   */
  static canStart(report: Report): boolean {
    return report.lastRunStatus !== ReportRunStatus.RUNNING;
  }

  /**
   * Initializes the report for starting execution.
   * Sets status to RUNNING, updates run timestamp and counter.
   * Clears any previous error message.
   *
   * Uses optimistic locking via Report.version to prevent concurrent executions.
   * If another process starts the report concurrently, save will fail with
   * OptimisticLockVersionMismatchError.
   *
   * @param report - Report entity to initialize
   * @param runAt - Timestamp when the run is starting
   * @throws BusinessViolationException if report is already running
   */
  static initializeStarting(report: Report, runAt: Date): void {
    if (!this.canStart(report)) {
      throw new BusinessViolationException(REPORT_RUN_ERROR_MESSAGES.AlreadyRunning);
    }

    report.lastRunStatus = ReportRunStatus.RUNNING;
    report.lastRunAt = runAt;
    report.runsCount += 1;
    report.lastRunError = undefined;
  }

  /**
   * Marks the report run as cancelled.
   * Updates both Report and DataMartRun statuses to CANCELLED.
   * Used when user cancels the run.
   */
  markAsCancelled(): void {
    this.report.lastRunStatus = ReportRunStatus.CANCELLED;
    this.dataMartRun.status = DataMartRunStatus.CANCELLED;
  }
}
