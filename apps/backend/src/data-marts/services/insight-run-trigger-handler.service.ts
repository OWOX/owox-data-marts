import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SCHEDULER_FACADE, SchedulerFacade } from '../../common/scheduler/shared/scheduler.facade';
import { TriggerHandler } from '../../common/scheduler/shared/trigger-handler.interface';
import { RunType } from '../../common/scheduler/shared/types';
import { InsightRunTrigger } from '../entities/insight-run-trigger.entity';
import { RunInsightCommand, RunInsightService } from '../use-cases/run-insight.service';

@Injectable()
export class InsightRunTriggerHandlerService
  implements TriggerHandler<InsightRunTrigger>, OnModuleInit
{
  private readonly logger = new Logger(InsightRunTriggerHandlerService.name);

  constructor(
    @InjectRepository(InsightRunTrigger)
    private readonly repository: Repository<InsightRunTrigger>,
    @Inject(SCHEDULER_FACADE)
    private readonly schedulerFacade: SchedulerFacade,
    private readonly runInsightService: RunInsightService
  ) {}

  async handleTrigger(
    trigger: InsightRunTrigger,
    options?: { signal?: AbortSignal }
  ): Promise<void> {
    try {
      if (options?.signal?.aborted) {
        this.logger.debug(`Trigger ${trigger.id} was cancelled before processing`);
        return;
      }

      this.logger.log(`Processing Insight run trigger ${trigger.id}`, {
        dataMartId: trigger.dataMartId,
        projectId: trigger.projectId,
        insightId: trigger.insightId,
        userId: trigger.userId,
        runType: RunType.manual,
      });

      const runId = await this.runInsightService.run(
        new RunInsightCommand(
          trigger.dataMartId,
          trigger.projectId,
          trigger.insightId,
          trigger.userId,
          RunType.manual
        )
      );

      trigger.uiResponse = { runId };
      trigger.onSuccess();
      await this.repository.save(trigger);
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Unknown error';
      this.logger.error(`Error processing Insight run trigger ${trigger.id}: ${error}`);
      trigger.uiResponse = { error };
      trigger.onError();
      await this.repository.save(trigger);
    }
  }

  getTriggerRepository(): Repository<InsightRunTrigger> {
    return this.repository;
  }

  processingCronExpression(): string {
    return '*/2 * * * * *';
  }

  stuckTriggerTimeoutSeconds(): number {
    return 60 * 60; // 1 hour
  }

  triggerTtlSeconds(): number {
    return 60 * 60 * 3; // 3 hours
  }

  async onModuleInit(): Promise<void> {
    await this.schedulerFacade.registerTriggerHandler(this);
  }
}
