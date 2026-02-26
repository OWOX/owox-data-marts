import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SCHEDULER_FACADE, SchedulerFacade } from '../../common/scheduler/shared/scheduler.facade';
import { TriggerHandler } from '../../common/scheduler/shared/trigger-handler.interface';
import { AiAssistantRunTrigger } from '../entities/ai-assistant-run-trigger.entity';
import {
  RunAiAssistantCommand,
  RunAiAssistantService,
} from '../use-cases/run-ai-assistant.service';
import { castError } from '@owox/internal-helpers';

@Injectable()
export class AiAssistantRunTriggerHandlerService
  implements TriggerHandler<AiAssistantRunTrigger>, OnModuleInit
{
  private readonly logger = new Logger(AiAssistantRunTriggerHandlerService.name);

  constructor(
    @InjectRepository(AiAssistantRunTrigger)
    private readonly repository: Repository<AiAssistantRunTrigger>,
    @Inject(SCHEDULER_FACADE)
    private readonly schedulerFacade: SchedulerFacade,
    private readonly runAiAssistantService: RunAiAssistantService
  ) {}

  async handleTrigger(
    trigger: AiAssistantRunTrigger,
    options?: { signal?: AbortSignal }
  ): Promise<void> {
    try {
      if (options?.signal?.aborted) {
        this.logger.debug(`Trigger ${trigger.id} was cancelled before processing`);
        return;
      }

      const result = await this.runAiAssistantService.run(
        new RunAiAssistantCommand(
          trigger.dataMartId,
          trigger.projectId,
          trigger.sessionId,
          trigger.userId,
          trigger.userMessageId
        )
      );

      trigger.uiResponse = {
        runId: result.runId,
        response: result.response,
        assistantMessageId: result.assistantMessageId,
      };
      trigger.onSuccess();
      await this.repository.save(trigger);
    } catch (e) {
      const errorMessage = castError(e).message;
      this.logger.error(`Error processing AI Assistant run trigger ${trigger.id}: ${errorMessage}`);
      trigger.uiResponse = { error: errorMessage };
      trigger.onError();
      await this.repository.save(trigger);
    }
  }

  getTriggerRepository(): Repository<AiAssistantRunTrigger> {
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
