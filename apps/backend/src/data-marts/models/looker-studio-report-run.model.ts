import { DataMartRun } from '../entities/data-mart-run.entity';
import { Report } from '../entities/report.entity';
import { BaseReportRun } from './base-report-run.model';

/**
 * Domain model for Looker Studio report run execution.
 *
 * Represents a single execution of a Looker Studio connector report.
 * These runs are triggered by Looker Studio when users open a report or refresh data.
 *
 * Characteristics:
 * - Always runs synchronously (user waits for results)
 * - Cannot be cancelled once started (business requirement)
 * - Runs are marked as "manual" type (user-initiated)
 * - Creates DataMartRun in STARTED status immediately
 *
 * Lifecycle:
 * 1. Created via LookerStudioReportRunService.create()
 * 2. Data is fetched and returned to Looker Studio
 * 3. Finished via LookerStudioReportRunService.finish() in a transaction
 *
 * @see LookerStudioReportRunService
 */
export class LookerStudioReportRun extends BaseReportRun {
  private constructor(report: Report, dataMartRun: DataMartRun) {
    super(report, dataMartRun);
  }

  /**
   * Creates a new Looker Studio report run instance.
   *
   * @param report - Report entity with loaded dataMart relation
   * @param dataMartRun - DataMartRun entity in STARTED status
   * @returns New LookerStudioReportRun instance
   */
  static create(report: Report, dataMartRun: DataMartRun): LookerStudioReportRun {
    return new LookerStudioReportRun(report, dataMartRun);
  }
}
