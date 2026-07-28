import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SCHEDULER_FACADE, SchedulerFacade } from '../../common/scheduler/shared/scheduler.facade';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataQualityRunTrigger } from '../entities/data-quality-run-trigger.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { RunDataQualityService } from '../use-cases/run-data-quality.service';
import { isCancellableDataMartRunStatus } from '../utils/data-mart-run-cancellation';
import { BaseRunTriggerHandlerService } from './base-run-trigger-handler.service';
import { DataMartRunService } from './data-mart-run.service';
import { DataQualityRunService } from './data-quality-run.service';

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
      const completedRun = await this.dataMartRunService.findById(trigger.dataMartRunId);
      if (completedRun?.status === DataMartRunStatus.CANCELLED) {
        await this.markTriggerAsCancelled(trigger);
        return;
      }
      const executionFinished =
        completedRun?.status === DataMartRunStatus.SUCCESS ||
        completedRun?.status === DataMartRunStatus.FAILED;
      if (options?.signal?.aborted && !executionFinished) {
        await this.markTriggerAsCancelled(trigger);
        return;
      }
    } catch (error) {
      if (isCancellation(error, options?.signal)) {
        const run = await this.dataMartRunService.findById(trigger.dataMartRunId);
        if (run && isCancellableDataMartRunStatus(run.status)) {
          await this.dataQualityRunService.cancelActiveRun(run.id, run.dataMartId);
        }
        await this.markTriggerAsCancelled(trigger);
        return;
      }

      const run = await this.dataMartRunService.findById(trigger.dataMartRunId);
      if (run?.status === DataMartRunStatus.CANCELLED) {
        await this.markTriggerAsCancelled(trigger);
        return;
      }
      await this.dataQualityRunService.markRunAndSummaryAsExecutionFailed(
        trigger.dataMartRunId,
        trigger.projectId,
        error,
        new Date()
      );
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
