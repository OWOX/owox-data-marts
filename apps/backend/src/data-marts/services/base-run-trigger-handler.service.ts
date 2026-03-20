import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Repository } from 'typeorm';
import { SchedulerFacade } from '../../common/scheduler/shared/scheduler.facade';
import { TriggerHandler } from '../../common/scheduler/shared/trigger-handler.interface';
import { Trigger } from '../../common/scheduler/shared/entities/trigger.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunService } from './data-mart-run.service';

const ORPHANED_RUN_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const ORPHANED_RUN_GRACE_PERIOD_MS = 10 * 60 * 1000;

/**
 * Base class for run trigger handlers.
 * Provides common logic for failing runs, cleaning up orphaned runs, and lifecycle management.
 */
export abstract class BaseRunTriggerHandlerService<T extends Trigger>
  implements TriggerHandler<T>, OnModuleInit, OnModuleDestroy
{
  protected abstract readonly logger: Logger;
  private cleanupIntervalId?: ReturnType<typeof setInterval>;

  constructor(
    protected readonly schedulerFacade: SchedulerFacade,
    protected readonly dataMartRunService: DataMartRunService,
    protected readonly dataMartRunRepository: Repository<DataMartRun>
  ) {}

  abstract handleTrigger(trigger: T, options?: { signal?: AbortSignal }): Promise<void>;
  abstract getTriggerRepository(): Repository<T>;
  abstract processingCronExpression(): string;
  abstract stuckTriggerTimeoutSeconds(): number;
  abstract triggerTtlSeconds(): number;

  /**
   * Returns the run types this handler manages (e.g., CONNECTOR or report types).
   */
  protected abstract getRunTypes(): string[];

  /**
   * Returns the trigger entity class for join queries in cleanup.
   */
  protected abstract getTriggerEntityClass(): new () => T;

  /**
   * Returns the field name used to link trigger to DataMartRun.
   */
  protected abstract getTriggerRunIdField(): string;

  /**
   * Safely marks a DataMartRun as FAILED, handling any errors during the operation.
   */
  protected async failDataMartRunSafely(dataMartRunId: string, error: unknown): Promise<void> {
    try {
      const run = await this.dataMartRunService.findById(dataMartRunId);
      if (
        run &&
        (run.status === DataMartRunStatus.PENDING || run.status === DataMartRunStatus.RUNNING)
      ) {
        run.status = DataMartRunStatus.FAILED;
        run.errors = [error instanceof Error ? error.message : String(error)];
        await this.dataMartRunRepository.save(run);
      }
    } catch (cleanupError) {
      this.logger.warn(
        `Failed to mark DataMartRun ${dataMartRunId} as FAILED: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`
      );
    }
  }

  async onModuleInit(): Promise<void> {
    await this.schedulerFacade.registerTriggerHandler(this);
    this.cleanupIntervalId = setInterval(
      () => this.cleanupOrphanedRuns(),
      ORPHANED_RUN_CLEANUP_INTERVAL_MS
    );
  }

  onModuleDestroy(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
    }
  }

  /**
   * Finds PENDING DataMartRun records that have no corresponding trigger
   * and marks them as FAILED. This handles the case where a trigger is deleted
   * by TTL cleanup while the run is still pending.
   */
  private async cleanupOrphanedRuns(): Promise<void> {
    try {
      const gracePeriod = new Date(Date.now() - ORPHANED_RUN_GRACE_PERIOD_MS);
      const runTypes = this.getRunTypes();
      const TriggerClass = this.getTriggerEntityClass();
      const triggerRunIdField = this.getTriggerRunIdField();

      const orphanedRuns = await this.dataMartRunRepository
        .createQueryBuilder('run')
        .leftJoin(TriggerClass, 'trigger', `trigger.${triggerRunIdField} = run.id`)
        .where('run.status = :status', { status: DataMartRunStatus.PENDING })
        .andWhere('run.type IN (:...types)', { types: runTypes })
        .andWhere('run.createdAt <= :gracePeriod', { gracePeriod })
        .andWhere('trigger.id IS NULL')
        .getMany();

      for (const run of orphanedRuns) {
        run.status = DataMartRunStatus.FAILED;
        run.errors = [
          'The run was not started because the maximum number of concurrent runs for this project was reached. Please wait for the current runs to finish and try again.',
        ];
        await this.dataMartRunRepository.save(run);
        this.logger.warn(`Orphaned PENDING run ${run.id} marked as FAILED`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to cleanup orphaned runs: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
