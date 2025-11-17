import { Injectable, Logger } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { DataMartRunService } from './data-mart-run.service';
import { ReportService } from './report.service';
import { RunType } from '../../common/scheduler/shared/types';
import { Report } from '../entities/report.entity';
import { LookerStudioReportRun } from '../models/looker-studio-report-run.model';
import { ReportRunStatus } from '../enums/report-run-status.enum';

/**
 * Service managing the lifecycle of Looker Studio Community Connector report runs.
 *
 * Differences from standard ReportRunService:
 * - No PENDING state: runs are created and immediately STARTED
 * - No optimistic locking: Looker Studio requests are always processed
 * - No cancellation support: connector requests run to completion
 * - Always manual run type (triggered by Looker Studio user)
 *
 * Responsibilities:
 * - Creates report runs in STARTED state within transaction
 * - Finalizes runs with SUCCESS or ERROR status
 * - Updates Report.runStatus based on execution result
 *
 * Transaction boundaries:
 * - create(): Creates DataMartRun in STARTED state
 * - finish(): Updates DataMartRun + Report.runStatus atomically
 *
 * @see LookerStudioReportRun - Domain model for Looker Studio runs
 */
@Injectable()
export class LookerStudioReportRunService {
  private readonly logger = new Logger(LookerStudioReportRunService.name);

  constructor(
    private readonly reportService: ReportService,
    private readonly dataMartRunService: DataMartRunService
  ) {}

  /**
   * Creates and starts a new Looker Studio report run. Always creates run in STARTED state (no PENDING phase).
   *
   * @param report - Report entity to run
   * @returns LookerStudioReportRun instance
   * @throws Error if DataMartRun creation fails (logged and propagated)
   */
  @Transactional()
  async create(report: Report): Promise<LookerStudioReportRun | null> {
    try {
      const dataMartRun = await this.dataMartRunService.createAndMarkReportRunAsStarted(report, {
        createdById: report.createdById,
        runType: RunType.manual,
      });

      return LookerStudioReportRun.create(report, dataMartRun);
    } catch (error) {
      this.logger.error(`Failed to create run for report ${report.id}`, error);
      throw error;
    }
  }

  /**
   * Finalizes Looker Studio report run by persisting results in transaction.
   *
   * @param reportRun - Completed Looker Studio report run
   */
  @Transactional()
  async finish(reportRun: LookerStudioReportRun): Promise<void> {
    await this.dataMartRunService.markReportRunAsFinished(reportRun.getDataMartRun());

    if (reportRun.isSuccess()) {
      await this.reportService.updateRunStatus(reportRun.getReportId(), ReportRunStatus.SUCCESS);
    } else {
      const error = reportRun.getReportError();
      await this.reportService.updateRunStatus(
        reportRun.getReportId(),
        ReportRunStatus.ERROR,
        error
      );
    }
  }
}
