import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SCHEDULER_FACADE, SchedulerFacade } from '../../common/scheduler/shared/scheduler.facade';
import { TriggerHandler } from '../../common/scheduler/shared/trigger-handler.interface';
import { SchemaActualizeTrigger } from '../entities/schema-actualize-trigger.entity';
import { ActualizeDataMartSchemaService } from '../use-cases/actualize-data-mart-schema.service';

@Injectable()
export class SchemaActualizeTriggerHandlerService
  implements TriggerHandler<SchemaActualizeTrigger>, OnModuleInit
{
  private readonly logger = new Logger(SchemaActualizeTriggerHandlerService.name);

  constructor(
    @InjectRepository(SchemaActualizeTrigger)
    private readonly repository: Repository<SchemaActualizeTrigger>,
    @Inject(SCHEDULER_FACADE)
    private readonly schedulerFacade: SchedulerFacade,
    private readonly actualizeSchemaService: ActualizeDataMartSchemaService
  ) {}

  async handleTrigger(
    trigger: SchemaActualizeTrigger,
    options?: { signal?: AbortSignal }
  ): Promise<void> {
    try {
      if (options?.signal?.aborted) return;

      await this.actualizeSchemaService.run({
        id: trigger.dataMartId,
        projectId: trigger.projectId,
      });

      trigger.uiResponse = { success: true };
      trigger.onSuccess();
      await this.repository.save(trigger);
    } catch (e) {
      trigger.uiResponse = {
        success: false,
        error: e instanceof Error ? e.message : 'Unknown error',
      };
      trigger.onError();
      await this.repository.save(trigger);
    }
  }

  getTriggerRepository(): Repository<SchemaActualizeTrigger> {
    return this.repository;
  }

  processingCronExpression(): string {
    return '*/2 * * * * *';
  }

  stuckTriggerTimeoutSeconds(): number {
    return 10 * 60; // 10 minutes
  }

  triggerTtlSeconds(): number {
    return 60 * 60; // 1 hour
  }

  async onModuleInit(): Promise<void> {
    await this.schedulerFacade.registerTriggerHandler(this);
  }
}
