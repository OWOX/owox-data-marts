import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SCHEDULER_FACADE, SchedulerFacade } from '../../common/scheduler/shared/scheduler.facade';
import { TriggerHandler } from '../../common/scheduler/shared/trigger-handler.interface';
import { SqlDryRunTrigger } from '../entities/sql-dry-run-trigger.entity';
import { SqlDryRunService } from '../use-cases/sql-dry-run.service';

/**
 * Handler service for processing SQL dry run triggers.
 * Implements TriggerHandler interface and self-registers with SchedulerFacade.
 */
@Injectable()
export class SqlDryRunTriggerHandlerService
  implements TriggerHandler<SqlDryRunTrigger>, OnModuleInit
{
  private readonly logger = new Logger(SqlDryRunTriggerHandlerService.name);

  constructor(
    @InjectRepository(SqlDryRunTrigger)
    private readonly repository: Repository<SqlDryRunTrigger>,
    @Inject(SCHEDULER_FACADE)
    private readonly schedulerFacade: SchedulerFacade,
    private readonly sqlDryRunService: SqlDryRunService
  ) {}

  /**
   * Handle SQL dry run trigger processing
   */
  async handleTrigger(
    trigger: SqlDryRunTrigger,
    options?: { signal?: AbortSignal }
  ): Promise<void> {
    try {
      this.logger.debug(
        `Processing SQL dry run trigger ${trigger.id} for data mart ${trigger.dataMartId}`
      );

      // Check if cancellation was requested
      if (options?.signal?.aborted) {
        this.logger.debug(`Trigger ${trigger.id} was cancelled before processing`);
        return;
      }

      // Execute SQL dry run
      const result = await this.sqlDryRunService.run({
        dataMartId: trigger.dataMartId,
        projectId: trigger.projectId,
        sql: trigger.sql,
      });

      // Save result in trigger
      trigger.uiResponse = {
        isValid: result.isValid,
        error: result.error,
        bytes: result.bytes,
      };
      trigger.onSuccess();
      await this.repository.save(trigger);

      this.logger.debug(`Successfully processed SQL dry run trigger ${trigger.id}`);
    } catch (error) {
      this.logger.error(`Error processing SQL dry run trigger ${trigger.id}:`, error);

      // Save error in trigger
      trigger.uiResponse = {
        isValid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      trigger.onError();
      await this.repository.save(trigger);
    }
  }

  /**
   * Returns the repository for SQL dry run triggers
   */
  getTriggerRepository(): Repository<SqlDryRunTrigger> {
    return this.repository;
  }

  /**
   * Check for new triggers every 2 seconds
   */
  processingCronExpression(): string {
    return '*/2 * * * * *'; // every 2 seconds
  }

  /**
   * Consider trigger stuck after 10 minutes (SQL validation should be fast)
   */
  stuckTriggerTimeoutSeconds(): number {
    return 10 * 60; // 10 minutes
  }

  /**
   * Set TTL for triggers to 1 hour (triggers should be processed within 1 hour)
   */
  triggerTtlSeconds(): number {
    return 60 * 60; // 1 hour
  }

  /**
   * Self-register with the scheduler facade when module initializes
   */
  async onModuleInit(): Promise<void> {
    await this.schedulerFacade.registerTriggerHandler(this);
  }
}
