import { Inject, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SCHEDULER_FACADE, SchedulerFacade } from '../../common/scheduler/shared/scheduler.facade';
import { TriggerHandler } from '../../common/scheduler/shared/trigger-handler.interface';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { PublishDraftsTrigger } from '../entities/publish-drafts-trigger.entity';
import { DataStorageMapper } from '../mappers/data-storage.mapper';
import {
  PUBLISH_DRAFTS_TRIGGER_ERROR_CODES,
  PublishDataStorageDraftsService,
} from '../use-cases/publish-data-storage-drafts.service';
import { PublishDataStorageDraftsCommand } from '../dto/domain/publish-data-storage-drafts.command';

const GENERIC_TRIGGER_ERROR = 'Publishing Data Mart drafts failed. Please try again.';

/** The storage was deleted while the trigger was pending; retrying cannot help. */
const STORAGE_GONE_ERROR = 'This Storage no longer exists. No Data Mart drafts were published.';

/**
 * The response is readable by any project viewer, so only text this codebase
 * authored may travel on it.
 *
 * A BusinessViolationException is trusted only when it carries one of the codes
 * this trigger's use case raises. The same exception type is thrown with raw
 * text elsewhere (the definition validator facade wraps warehouse dry-run
 * output, ActualizeDataMartSchema wraps an arbitrary error.message), and a code
 * alone only proves some thrower opted in — not that this path authored the
 * wording. Matching the allowlist makes the guarantee structural rather than a
 * property of the current call graph.
 *
 * NotFoundException is mapped separately because it is a permanent condition —
 * its own message is not reused, since it embeds storage and project ids.
 */
function toTriggerErrorMessage(error: unknown): string {
  if (error instanceof NotFoundException) {
    return STORAGE_GONE_ERROR;
  }
  if (
    error instanceof BusinessViolationException &&
    error.code &&
    PUBLISH_DRAFTS_TRIGGER_ERROR_CODES.has(error.code)
  ) {
    return error.message;
  }
  return GENERIC_TRIGGER_ERROR;
}

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
    private readonly publishDraftsService: PublishDataStorageDraftsService,
    private readonly dataStorageMapper: DataStorageMapper
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

      trigger.uiResponse = this.dataStorageMapper.toPublishDraftsResponse(result);
      trigger.onSuccess();
      await this.repository.save(trigger);
    } catch (e) {
      this.logger.warn(
        `Trigger ${trigger.id} failed: ${e instanceof Error ? e.message : 'Unknown error'}`,
        { stack: e instanceof Error ? e.stack : undefined }
      );
      trigger.uiResponse = {
        successCount: 0,
        failedCount: 0,
        error: toTriggerErrorMessage(e),
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
