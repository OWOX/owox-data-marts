import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SCHEDULER_FACADE, SchedulerFacade } from '../../common/scheduler/shared/scheduler.facade';
import { TriggerHandler } from '../../common/scheduler/shared/trigger-handler.interface';
import { PublishDraftsTrigger } from '../entities/publish-drafts-trigger.entity';
import { PublishDataStorageDraftsService } from '../use-cases/publish-data-storage-drafts.service';
import { PublishDataStorageDraftsCommand } from '../dto/domain/publish-data-storage-drafts.command';

@Injectable()
export class PublishDraftsTriggerHandlerService
  implements TriggerHandler<PublishDraftsTrigger>, OnModuleInit
{
  private readonly logger = new Logger(PublishDraftsTriggerHandlerService.name);

  constructor(
    @InjectRepository(PublishDraftsTrigger)
    private readonly repository: Repository<PublishDraftsTrigger>,
    @Inject(SCHEDULER_FACADE)
    private readonly schedulerFacade: SchedulerFacade,
    private readonly publishDraftsService: PublishDataStorageDraftsService
  ) {}

  async handleTrigger(
    trigger: PublishDraftsTrigger,
    options?: { signal?: AbortSignal }
  ): Promise<void> {
    this.logger.debug(`Processing trigger ${trigger.id}`);
    try {
      if (options?.signal?.aborted) return;

      const command = new PublishDataStorageDraftsCommand(
        trigger.dataStorageId,
        trigger.projectId,
        trigger.userId
      );

      const result = await this.publishDraftsService.run(command);

      trigger.uiResponse = {
        successCount: result.successCount,
        failedCount: result.failedCount,
      };
      trigger.onSuccess();
      await this.repository.save(trigger);
    } catch (e) {
      this.logger.warn(
        `Trigger ${trigger.id} failed: ${e instanceof Error ? e.message : 'Unknown error'}`
      );
      trigger.uiResponse = {
        successCount: 0,
        failedCount: 0,
        error: e instanceof Error ? e.message : 'Unknown error',
      };
      trigger.onError();
      await this.repository.save(trigger);
    }
  }

  getTriggerRepository(): Repository<PublishDraftsTrigger> {
    return this.repository;
  }

  processingCronExpression(): string {
    return '*/2 * * * * *'; // 2 seconds
  }

  stuckTriggerTimeoutSeconds(): number {
    return 15 * 60; // 15 minutes
  }

  triggerTtlSeconds(): number {
    return 60 * 60; // 1 hour
  }

  async onModuleInit(): Promise<void> {
    await this.schedulerFacade.registerTriggerHandler(this);
  }
}
