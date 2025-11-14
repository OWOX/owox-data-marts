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

    if (!ReportRun.canStart(report)) {
      return null;
    }

    ReportRun.initializeStarting(report, this.systemTimeService.now());

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
   * Saves both Report and DataMartRun entities in single transaction.
   * Report contains runStatus and lastRunAt, DataMartRun contains full execution details.
   *
   * @param reportRun - Completed report run (SUCCESS/FAILED/CANCELLED)
   */
  @Transactional()
  async finish(reportRun: ReportRun): Promise<void> {
    await this.reportService.saveReport(reportRun.getReport());
    await this.dataMartRunService.markReportRunAsFinished(reportRun.getDataMartRun());
  }
}
