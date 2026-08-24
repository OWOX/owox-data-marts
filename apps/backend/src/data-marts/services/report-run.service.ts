import { Injectable } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { ReportRun } from '../models/report-run.model';
import { DataMartRunService } from './data-mart-run.service';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import { RunReportCommand } from '../dto/domain/run-report.command';
import { ReportService } from './report.service';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import {
  isPullBasedDataDestinationType,
  toHumanReadable,
} from '../data-destination-types/enums/data-destination-type.enum';

const ERROR_NAMES = {
  OPTIMISTIC_LOCK: 'OptimisticLockVersionMismatchError',
} as const;

/**
 * Service managing the lifecycle of standard ReportRun entities.
 *
 * Responsibilities:
 * - Creates pending report runs with optimistic locking
 * - Transitions runs through states: PENDING → STARTED → SUCCESS/FAILED/CANCELLED
 * - Coordinates between Report and DataMartRun entities
 *
 * Transaction boundaries:
 * - createPending(): Creates Report.lastRunAt + DataMartRun in single transaction
 * - finish(): Updates Report.runStatus + DataMartRun.status in single transaction
 *
 * Concurrency handling:
 * - Uses optimistic locking via Report.version to prevent duplicate runs
 * - Returns null instead of throwing when run cannot be created
 *
 * @see ReportRun - Domain model for scheduled/manual report runs
 */
@Injectable()
export class ReportRunService {
  constructor(
    private readonly reportService: ReportService,
    private readonly dataMartRunService: DataMartRunService,
    private readonly systemTimeService: SystemTimeService
  ) {}

  /**
   * Attempts to create and start a new report run.
   *
   * @param command - Command containing reportId, userId, and runType
   * @returns ReportRun instance if successfully created, null if:
   *          - Report is already running (status check failed)
   *          - Another process started the report concurrently (optimistic lock conflict)
   */
  @Transactional()
  async createPending(command: RunReportCommand): Promise<ReportRun | null> {
    const report = await this.reportService.getById(command.reportId);

    // Guarded here rather than at the API edge so scheduled triggers are refused too: this is
    // the one place both the manual and the scheduled path pass through. Enqueueing such a run
    // would succeed and then fail in the worker with "No component found for type", because a
    // pull-based destination has no report writer by design.
    if (isPullBasedDataDestinationType(report.dataDestination.type)) {
      throw new BusinessViolationException(
        `Reports on a ${toHumanReadable(report.dataDestination.type)} destination cannot be run ` +
          `from the server — the data is read by the destination itself.`
      );
    }

    if (!ReportRun.canStart(report)) {
      return null;
    }

    ReportRun.initializeStarting(report, this.systemTimeService.now());

    try {
      await this.reportService.updateReportWithVersionControl(report);

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

  /**
   * Loads an existing ReportRun by DataMartRun ID.
   * Used by trigger handler to resume execution of a pre-created run.
   */
  async loadByDataMartRunId(dataMartRunId: string): Promise<ReportRun | null> {
    const dataMartRun = await this.dataMartRunService.findById(dataMartRunId);
    if (!dataMartRun || !dataMartRun.reportId) {
      return null;
    }

    const report = await this.reportService.getById(dataMartRun.reportId);
    return ReportRun.create(report, dataMartRun);
  }

  /**
   * Marks report run as started.
   * Persists STARTED status to database.
   *
   * @param reportRun - Report run to mark as started
   */
  async markAsStarted(reportRun: ReportRun): Promise<void> {
    await this.dataMartRunService.markReportRunAsStarted(reportRun.getDataMartRun());
  }

  /**
   * Finalizes report run by persisting final state to database.
   *
   * Persists the Report's run outcome (targeted column update — a full entity save would
   * cascade the run-start DataMart snapshot over columns written during the run) and the
   * DataMartRun with full execution details, in a single transaction.
   *
   * @param reportRun - Completed report run (SUCCESS/FAILED/CANCELLED)
   * @param context - Optional context to append execution artifacts:
   *                  - logs: array of log entries to append to DataMartRun.logs
   *                  - errors: array of error entries to append to DataMartRun.errors
   */
  @Transactional()
  async finish(
    reportRun: ReportRun,
    context?: { logs?: string[]; errors?: string[] }
  ): Promise<void> {
    await this.reportService.updateLastRunOutcome(reportRun.getReport());
    if (context?.logs?.length) {
      const dmRun = reportRun.getDataMartRun();
      dmRun.logs = [...(dmRun.logs || []), ...context.logs];
    }
    if (context?.errors?.length) {
      const dmRun = reportRun.getDataMartRun();
      dmRun.errors = [...(dmRun.errors || []), ...context.errors];
    }
    await this.dataMartRunService.markReportRunAsFinished(reportRun.getDataMartRun());
  }
}
