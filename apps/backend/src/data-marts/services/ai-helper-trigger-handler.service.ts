import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OwoxEventDispatcher } from '../../common/event-dispatcher/owox-event-dispatcher';
import { SCHEDULER_FACADE, SchedulerFacade } from '../../common/scheduler/shared/scheduler.facade';
import { TriggerHandler } from '../../common/scheduler/shared/trigger-handler.interface';
import { GenerateDataMartMetadataCommand } from '../dto/domain/generate-data-mart-metadata.command';
import { AiHelperTrigger } from '../entities/ai-helper-trigger.entity';
import { DataMartAiHelperGeneratedEvent } from '../events/data-mart-ai-helper-generated.event';
import { GenerateDataMartMetadataService } from '../use-cases/generate-data-mart-metadata.service';

/**
 * Handler service for processing AI helper triggers.
 *
 * Picked up by the scheduler every ~2 seconds; delegates the actual work to
 * `GenerateDataMartMetadataService`. Mirrors the `SqlDryRunTriggerHandler` pattern:
 * we pass an empty `userId` so the use-case's in-process EDIT access check is
 * skipped — access was already verified at the POST that created this trigger,
 * and the original request `roles` are not available in the background context.
 *
 * Failures are written into `uiResponse.error` rather than rethrown — the
 * scheduler considers the run "complete" either way; the UI then surfaces the
 * message. Analytics events are emitted from here so the use-case stays clean
 * of caller-specific instrumentation.
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
    private readonly generateDataMartMetadataService: GenerateDataMartMetadataService,
    private readonly eventDispatcher: OwoxEventDispatcher
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

      // Pass empty userId/roles so the use-case skips its access check — same trick
      // as SqlDryRunTriggerHandler. Access is already enforced at trigger creation.
      const command = new GenerateDataMartMetadataCommand(
        trigger.dataMartId,
        trigger.projectId,
        trigger.scope,
        trigger.useSample,
        trigger.fieldName ?? undefined,
        '',
        []
      );

      const result = await this.generateDataMartMetadataService.run(command);

      trigger.uiResponse = { result };
      trigger.onSuccess();
      await this.repository.save(trigger);

      // Fire-and-forget analytics — failures must not flip a SUCCESSful trigger.
      void this.publishGeneratedEvent(trigger);

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

  private async publishGeneratedEvent(trigger: AiHelperTrigger): Promise<void> {
    try {
      await this.eventDispatcher.publishExternal(
        new DataMartAiHelperGeneratedEvent({
          projectId: trigger.projectId,
          dataMartId: trigger.dataMartId,
          userId: trigger.userId,
          scope: trigger.scope,
        })
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish DataMartAiHelperGeneratedEvent (trigger=${trigger.id}, scope=${trigger.scope})`,
        error
      );
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
