import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SCHEDULER_FACADE, SchedulerFacade } from '../../common/scheduler/shared/scheduler.facade';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataQualityRunTrigger } from '../entities/data-quality-run-trigger.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import {
  DataQualityConsumptionPublicationError,
  RunDataQualityService,
} from '../use-cases/run-data-quality.service';
import { BaseRunTriggerHandlerService } from './base-run-trigger-handler.service';
import { DataMartRunService } from './data-mart-run.service';
import { DataQualityRunService } from './data-quality-run.service';
import { isCancellableDataMartRunStatus } from '../utils/data-mart-run-cancellation';

@Injectable()
export class DataQualityRunTriggerHandlerService extends BaseRunTriggerHandlerService<DataQualityRunTrigger> {
  protected readonly logger = new Logger(DataQualityRunTriggerHandlerService.name);

  constructor(
    @InjectRepository(DataQualityRunTrigger)
    private readonly repository: Repository<DataQualityRunTrigger>,
    @InjectRepository(DataMartRun)
    dataMartRunRepository: Repository<DataMartRun>,
    @Inject(SCHEDULER_FACADE)
    schedulerFacade: SchedulerFacade,
    private readonly runDataQualityService: RunDataQualityService,
    dataMartRunService: DataMartRunService,
    private readonly dataQualityRunService: DataQualityRunService
  ) {
    super(schedulerFacade, dataMartRunService, dataMartRunRepository);
  }

  async handleTrigger(
    trigger: DataQualityRunTrigger,
    options?: { signal?: AbortSignal }
  ): Promise<void> {
    if (await this.cancelTriggerIfRunAlreadyCancelled(trigger)) return;

    try {
      await this.runDataQualityService.executeExistingRun(
        trigger.dataMartRunId,
        trigger.projectId,
        options?.signal
      );
      if (options?.signal?.aborted) {
        await this.markTriggerAsCancelled(
          trigger,
          `Cancelled Data Quality trigger ${trigger.id}: abort signal received`
        );
      }
    } catch (error) {
      if (isCancellation(error, options?.signal)) {
        const run = await this.dataMartRunService.findById(trigger.dataMartRunId);
        if (run && isCancellableDataMartRunStatus(run.status)) {
          const cancelled = await this.dataMartRunService.markAsCancelled(run);
          if (cancelled && run.finishedAt) {
            await this.dataQualityRunService.markAsCancelled(run.id, run.finishedAt);
          }
        }
        await this.markTriggerAsCancelled(trigger);
        return;
      }
      if (error instanceof DataQualityConsumptionPublicationError) {
        trigger.status = TriggerStatus.IDLE;
        trigger.isActive = true;
        await this.repository.save(trigger);
        this.logger.warn(
          `Consumption publication failed for Data Quality run ${trigger.dataMartRunId}; trigger ${trigger.id} will retry before SQL`
        );
        return;
      }

      const run = await this.dataMartRunService.findById(trigger.dataMartRunId);
      if (run?.status === DataMartRunStatus.CANCELLED) {
        await this.markTriggerAsCancelled(trigger);
        return;
      }
      try {
        await this.dataQualityRunService.markRunAndSummaryAsExecutionFailed(
          trigger.dataMartRunId,
          error,
          new Date()
        );
      } catch (terminalizationError) {
        trigger.status = TriggerStatus.IDLE;
        trigger.isActive = true;
        await this.repository.save(trigger);
        this.logger.warn(
          `Failed to terminalize Data Quality run ${trigger.dataMartRunId}; trigger ${trigger.id} will retry: ${terminalizationError instanceof Error ? terminalizationError.message : String(terminalizationError)}`
        );
        return;
      }
      throw error;
    }
  }

  getTriggerRepository(): Repository<DataQualityRunTrigger> {
    return this.repository;
  }

  processingCronExpression(): string {
    return '*/5 * * * * *';
  }

  stuckTriggerTimeoutSeconds(): number {
    return 60 * 60;
  }

  triggerTtlSeconds(): number {
    return 23 * 60 * 60;
  }

  protected getRunTypes(): string[] {
    return [DataMartRunType.DATA_QUALITY];
  }

  protected getTriggerEntityClass(): new () => DataQualityRunTrigger {
    return DataQualityRunTrigger;
  }

  protected getTriggerRunIdField(): string {
    return 'dataMartRunId';
  }

  protected override getOrphanedRunStatuses(): DataMartRunStatus[] {
    return [DataMartRunStatus.PENDING, DataMartRunStatus.RUNNING];
  }

  protected override getOrphanedRunError(_run: DataMartRun): string {
    return 'The Data Quality run trigger expired before the run could complete.';
  }

  protected override async onOrphanedRunFailed(run: DataMartRun): Promise<void> {
    await this.dataQualityRunService.markAsExecutionFailed(run.id, run.finishedAt!);
  }
}

function isCancellation(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}
