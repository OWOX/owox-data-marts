import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SCHEDULER_FACADE, SchedulerFacade } from '../../common/scheduler/shared/scheduler.facade';
import { TriggerHandler } from '../../common/scheduler/shared/trigger-handler.interface';
import { GenerateDataMartMetadataCommand } from '../dto/domain/generate-data-mart-metadata.command';
import { AiHelperTrigger } from '../entities/ai-helper-trigger.entity';
import { GenerateDataMartMetadataService } from '../use-cases/generate-data-mart-metadata.service';

/**
 * Handler service for processing AI helper triggers.
 *
 * Picked up by the scheduler every ~2 seconds; delegates the actual work to the
 * existing `GenerateDataMartMetadataService` so the use-case (validation, sample, agent,
 * analytics event) stays a single source of truth and is shared with any other entry
 * point. Failures are written into `uiResponse.error` rather than rethrown — the
 * scheduler considers the run "complete" either way; the UI then surfaces the message.
 */
@Injectable()
export class AiHelperTriggerHandlerService
  implements TriggerHandler<AiHelperTrigger>, OnModuleInit
{
  private readonly logger = new Logger(AiHelperTriggerHandlerService.name);

  constructor(
    @InjectRepository(AiHelperTrigger)
    private readonly repository: Repository<AiHelperTrigger>,
    @Inject(SCHEDULER_FACADE)
    private readonly schedulerFacade: SchedulerFacade,
    private readonly generateDataMartMetadataService: GenerateDataMartMetadataService
  ) {}

  async handleTrigger(trigger: AiHelperTrigger, options?: { signal?: AbortSignal }): Promise<void> {
    try {
      this.logger.debug(
        `Processing AI helper trigger ${trigger.id} for data mart ${trigger.dataMartId} (scope=${trigger.scope})`
      );

      if (options?.signal?.aborted) {
        this.logger.debug(`Trigger ${trigger.id} was cancelled before processing`);
        return;
      }

      // Access was already verified by the POST controller that created the trigger.
      // We can't re-check here because the user's roles are not available in the
      // background scheduler context — a fresh matrix check with `roles=[]` would
      // reject any user whose edit rights came from a role rather than ownership.
      // `skipAccessCheck=true` documents this intent; `userId` is still carried so
      // the use-case emits the analytics event for the correct actor.
      const command = new GenerateDataMartMetadataCommand(
        trigger.dataMartId,
        trigger.projectId,
        trigger.scope,
        trigger.useSample,
        trigger.fieldName ?? undefined,
        trigger.userId,
        [],
        true
      );

      const result = await this.generateDataMartMetadataService.run(command);

      trigger.uiResponse = { result };
      trigger.onSuccess();
      await this.repository.save(trigger);

      this.logger.debug(`Successfully processed AI helper trigger ${trigger.id}`);
    } catch (error) {
      this.logger.error(`Error processing AI helper trigger ${trigger.id}:`, error);
      trigger.uiResponse = {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      trigger.onError();
      await this.repository.save(trigger);
    }
  }

  getTriggerRepository(): Repository<AiHelperTrigger> {
    return this.repository;
  }

  /**
   * Poll for new AI helper triggers every 2 seconds — matches the cadence of other
   * UI-facing triggers (SQL dry-run, schema actualize) so the frontend's 1s polling
   * sees a fast turnaround.
   */
  processingCronExpression(): string {
    return '*/2 * * * * *';
  }

  /**
   * AI generation typically completes in under a minute. Three minutes is a generous
   * upper bound that still gives the stuck-detection some room before flipping a run
   * to ERROR.
   */
  stuckTriggerTimeoutSeconds(): number {
    return 3 * 60;
  }

  /**
   * Garbage-collect leftover trigger rows after an hour, mirroring other UiTrigger
   * implementations.
   */
  triggerTtlSeconds(): number {
    return 60 * 60;
  }

  async onModuleInit(): Promise<void> {
    await this.schedulerFacade.registerTriggerHandler(this);
  }
}
