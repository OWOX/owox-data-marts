import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SCHEDULER_FACADE, SchedulerFacade } from '../../common/scheduler/shared/scheduler.facade';
import { TriggerHandler } from '../../common/scheduler/shared/trigger-handler.interface';
import { RunType } from '../../common/scheduler/shared/types';
import { InsightTemplateRunTrigger } from '../entities/insight-template-run-trigger.entity';
import {
  RunInsightTemplateCommand,
  RunInsightTemplateService,
} from '../use-cases/run-insight-template.service';

@Injectable()
export class InsightTemplateRunTriggerHandlerService
  implements TriggerHandler<InsightTemplateRunTrigger>, OnModuleInit
{
  private readonly logger = new Logger(InsightTemplateRunTriggerHandlerService.name);

  constructor(
    @InjectRepository(InsightTemplateRunTrigger)
    private readonly repository: Repository<InsightTemplateRunTrigger>,
    @Inject(SCHEDULER_FACADE)
    private readonly schedulerFacade: SchedulerFacade,
    private readonly runInsightTemplateService: RunInsightTemplateService
  ) {}

  async handleTrigger(
    trigger: InsightTemplateRunTrigger,
    options?: { signal?: AbortSignal }
  ): Promise<void> {
    try {
      if (options?.signal?.aborted) {
        this.logger.debug(`Trigger ${trigger.id} was cancelled before processing`);
        return;
      }

      this.logger.log(`Processing Insight Template run trigger ${trigger.id}`, {
        dataMartId: trigger.dataMartId,
        projectId: trigger.projectId,
        insightTemplateId: trigger.insightTemplateId,
        userId: trigger.userId,
        runType: RunType.manual,
      });

      const runId = await this.runInsightTemplateService.run(
        new RunInsightTemplateCommand(
          trigger.dataMartId,
          trigger.projectId,
          trigger.insightTemplateId,
          trigger.userId,
          RunType.manual
        )
      );

      trigger.uiResponse = { runId };
      trigger.onSuccess();
      await this.repository.save(trigger);
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Unknown error';
      this.logger.error(`Error processing Insight Template run trigger ${trigger.id}: ${error}`);
      trigger.uiResponse = { error };
      trigger.onError();
      await this.repository.save(trigger);
    }
  }

  getTriggerRepository(): Repository<InsightTemplateRunTrigger> {
    return this.repository;
  }

  processingCronExpression(): string {
    return '*/2 * * * * *';
  }

  stuckTriggerTimeoutSeconds(): number {
    return 60 * 60;
  }

  triggerTtlSeconds(): number {
    return 60 * 60 * 3;
  }

  async onModuleInit(): Promise<void> {
    await this.schedulerFacade.registerTriggerHandler(this);
  }
}
