import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { SCHEDULER_FACADE, SchedulerFacade } from '../../common/scheduler/shared/scheduler.facade';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { ConcurrencyLimitExceededException } from '../../common/exceptions/concurrency-limit-exceeded.exception';
import { ReportRunTrigger } from '../entities/report-run-trigger.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { DataMartRunService } from './data-mart-run.service';
import { RunReportService } from '../use-cases/run-report.service';
import { BaseRunTriggerHandlerService } from './base-run-trigger-handler.service';

const REPORT_RUN_TYPES = [
  DataMartRunType.GOOGLE_SHEETS_EXPORT,
  DataMartRunType.LOOKER_STUDIO,
  DataMartRunType.EMAIL,
  DataMartRunType.SLACK,
  DataMartRunType.MS_TEAMS,
  DataMartRunType.GOOGLE_CHAT,
];

@Injectable()
export class ReportRunTriggerHandlerService extends BaseRunTriggerHandlerService<ReportRunTrigger> {
  protected readonly logger = new Logger(ReportRunTriggerHandlerService.name);

  constructor(
    @InjectRepository(ReportRunTrigger)
    private readonly repository: Repository<ReportRunTrigger>,
    @InjectRepository(DataMartRun)
    dataMartRunRepository: Repository<DataMartRun>,
    @Inject(SCHEDULER_FACADE)
    schedulerFacade: SchedulerFacade,
    private readonly runReportService: RunReportService,
    dataMartRunService: DataMartRunService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource
  ) {
    super(schedulerFacade, dataMartRunService, dataMartRunRepository);
  }

  async handleTrigger(
    trigger: ReportRunTrigger,
    options?: { signal?: AbortSignal }
  ): Promise<void> {
    try {
      await this.claimRunSlotAtomically(trigger.dataMartRunId, trigger.projectId);

      this.logger.log(
        `Executing report run for report ${trigger.reportId}, dataMartRunId ${trigger.dataMartRunId}`
      );

      await this.runReportService.executeExistingRun(
        trigger.dataMartRunId,
        trigger.projectId,
        options?.signal
      );
    } catch (error) {
      if (error instanceof ConcurrencyLimitExceededException) {
        this.logger.warn(
          `Report concurrency limit reached for project ${trigger.projectId}, trigger ${trigger.id} will retry`
        );
        trigger.status = TriggerStatus.IDLE;
        trigger.isActive = true;
        await this.repository.save(trigger);
        return;
      }

      const existingRun = await this.dataMartRunService.findById(trigger.dataMartRunId);
      if (existingRun?.status === DataMartRunStatus.RUNNING) {
        this.logger.warn(
          `DataMartRun ${trigger.dataMartRunId} is already RUNNING, skipping duplicate trigger ${trigger.id}`
        );
        return;
      }

      await this.failDataMartRunSafely(trigger.dataMartRunId, error);

      this.logger.error(
        `Error processing report run trigger ${trigger.id}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Claims a run slot using optimistic approach: claim first, then verify the limit.
   * 1. Atomically set run status to RUNNING (UPDATE WHERE status=PENDING)
   * 2. Count all RUNNING runs for the project
   * 3. If over limit — throw (transaction rolls back, run returns to PENDING)
   *
   * TODO: This approach has a potential race condition under MySQL REPEATABLE READ isolation.
   * Two workers may simultaneously claim slots and both pass the limit check because
   * each transaction doesn't see the other's uncommitted UPDATE. Consider using
   * SELECT ... FOR UPDATE with advisory locks or a semaphore table for strict enforcement.
   */
  private async claimRunSlotAtomically(dataMartRunId: string, projectId: string): Promise<void> {
    const maxRuns = this.configService.get<number>('MAX_REPORT_RUNS_PER_PROJECT', 1000);

    await this.dataSource.transaction(async manager => {
      const claimResult = await manager.update(
        DataMartRun,
        { id: dataMartRunId, status: DataMartRunStatus.PENDING },
        { status: DataMartRunStatus.RUNNING }
      );

      if (!claimResult.affected) {
        throw new Error(`DataMartRun ${dataMartRunId} is not in PENDING status, cannot claim`);
      }

      const activeCount = await manager
        .createQueryBuilder(DataMartRun, 'run')
        .innerJoin(DataMart, 'dm', 'dm.id = run.dataMartId')
        .where('dm.projectId = :projectId', { projectId })
        .andWhere('run.status = :status', { status: DataMartRunStatus.RUNNING })
        .andWhere('run.type IN (:...types)', { types: REPORT_RUN_TYPES })
        .getCount();

      if (activeCount >= maxRuns) {
        throw new ConcurrencyLimitExceededException(
          `Project ${projectId} has reached the limit of ${maxRuns} concurrent report runs`
        );
      }
    });
  }

  getTriggerRepository(): Repository<ReportRunTrigger> {
    return this.repository;
  }

  processingCronExpression(): string {
    return '*/5 * * * * *';
  }

  stuckTriggerTimeoutSeconds(): number {
    return 60 * 60;
  }

  triggerTtlSeconds(): number {
    return 23 * 60 * 60;
  }

  protected getRunTypes(): string[] {
    return REPORT_RUN_TYPES;
  }

  protected getTriggerEntityClass(): new () => ReportRunTrigger {
    return ReportRunTrigger;
  }

  protected getTriggerRunIdField(): string {
    return 'dataMartRunId';
  }
}
