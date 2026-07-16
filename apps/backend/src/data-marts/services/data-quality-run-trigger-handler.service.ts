import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { SCHEDULER_FACADE, SchedulerFacade } from '../../common/scheduler/shared/scheduler.facade';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataQualityRunTrigger } from '../entities/data-quality-run-trigger.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import {
  DataQualityResultPersistenceError,
  RunDataQualityService,
} from '../use-cases/run-data-quality.service';
import { DataQualityConsumptionPublicationError } from './data-quality-consumption.service';
import { BaseRunTriggerHandlerService } from './base-run-trigger-handler.service';
import { DataMartRunService } from './data-mart-run.service';
import { DataQualityRunService } from './data-quality-run.service';
import { isCancellableDataMartRunStatus } from '../utils/data-mart-run-cancellation';
import {
  TriggerExecutionOwnership,
  TriggerExecutionOwnershipError,
} from '../../common/scheduler/shared/trigger-execution-ownership.error';

const EXECUTION_OWNERSHIP_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

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
    const executionOwnership = this.startExecutionOwnershipHeartbeat(trigger);

    try {
      await executionOwnership.ownership.assertOwned();
      await this.runDataQualityService.executeExistingRun(
        trigger.dataMartRunId,
        trigger.projectId,
        options?.signal,
        executionOwnership.ownership
      );
      if (options?.signal?.aborted) {
        await this.markTriggerAsCancelled(
          trigger,
          `Cancelled Data Quality trigger ${trigger.id}: abort signal received`
        );
        return;
      }
      await executionOwnership.ownership.assertOwned();
    } catch (error) {
      if (
        error instanceof DataQualityConsumptionPublicationError ||
        error instanceof DataQualityResultPersistenceError
      ) {
        await this.returnOwnedTriggerToIdle(trigger);
        const phase =
          error instanceof DataQualityConsumptionPublicationError
            ? 'Consumption publication'
            : 'Result persistence';
        this.logger.warn(
          `${phase} failed for Data Quality run ${trigger.dataMartRunId}; trigger ${trigger.id} will retry`
        );
        return;
      }
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
      if (error instanceof TriggerExecutionOwnershipError) throw error;

      const run = await this.dataMartRunService.findById(trigger.dataMartRunId);
      if (run?.status === DataMartRunStatus.CANCELLED) {
        await this.markTriggerAsCancelled(trigger);
        return;
      }
      await executionOwnership.ownership.assertOwned();
      try {
        await this.dataQualityRunService.markRunAndSummaryAsExecutionFailed(
          trigger.dataMartRunId,
          trigger.projectId,
          error,
          new Date(),
          executionOwnership.ownership
        );
      } catch (terminalizationError) {
        await this.returnOwnedTriggerToIdle(trigger);
        this.logger.warn(
          `Failed to terminalize Data Quality run ${trigger.dataMartRunId}; trigger ${trigger.id} will retry: ${terminalizationError instanceof Error ? terminalizationError.message : String(terminalizationError)}`
        );
        return;
      }
      throw error;
    } finally {
      await executionOwnership.stop();
    }
  }

  private async returnOwnedTriggerToIdle(trigger: DataQualityRunTrigger): Promise<void> {
    const executionVersion = trigger.version;
    const modifiedAt = new Date();
    const { affected } = await this.repository.update(
      {
        id: trigger.id,
        isActive: true,
        status: TriggerStatus.PROCESSING,
        version: executionVersion,
      },
      {
        status: TriggerStatus.IDLE,
        isActive: true,
        modifiedAt,
        version: () => 'version + 1',
      }
    );
    if (!affected) {
      throw new TriggerExecutionOwnershipError(trigger.id, executionVersion);
    }
    trigger.status = TriggerStatus.IDLE;
    trigger.isActive = true;
    trigger.modifiedAt = modifiedAt;
    trigger.version = executionVersion + 1;
  }

  protected override async markTriggerAsCancelled(
    trigger: DataQualityRunTrigger,
    logMessage?: string
  ): Promise<void> {
    const executionVersion = trigger.version;
    const cancelledState = {
      status: TriggerStatus.CANCELLED,
      isActive: false,
      version: () => 'version + 1',
    } as const;
    const ownedCancellation = await this.repository.update(
      {
        id: trigger.id,
        status: TriggerStatus.PROCESSING,
        version: executionVersion,
      },
      cancelledState
    );
    let persistedVersion = executionVersion + 1;
    if (!ownedCancellation.affected) {
      // UI cancellation deliberately transfers the trigger to CANCELLING and advances its epoch.
      // Completing that explicit cancellation is safe; a recovered PROCESSING epoch is not.
      const requestedCancellation = await this.repository.update(
        {
          id: trigger.id,
          status: TriggerStatus.CANCELLING,
          version: executionVersion + 1,
        },
        cancelledState
      );
      if (!requestedCancellation.affected) {
        throw new TriggerExecutionOwnershipError(trigger.id, executionVersion);
      }
      persistedVersion = executionVersion + 2;
    }
    trigger.status = TriggerStatus.CANCELLED;
    trigger.isActive = false;
    trigger.version = persistedVersion;
    if (logMessage) this.logger.log(logMessage);
  }

  private startExecutionOwnershipHeartbeat(trigger: DataQualityRunTrigger): {
    ownership: TriggerExecutionOwnership;
    stop(): Promise<void>;
  } {
    const executionVersion = trigger.version;
    let ownershipError: TriggerExecutionOwnershipError | null = null;
    let heartbeat: Promise<void> | null = null;
    let stopped = false;

    const assertOwned = async (manager?: EntityManager): Promise<void> => {
      if (ownershipError) throw ownershipError;
      try {
        const modifiedAt = new Date();
        const repository = manager?.getRepository(DataQualityRunTrigger) ?? this.repository;
        const { affected } = await repository.update(
          {
            id: trigger.id,
            isActive: true,
            status: TriggerStatus.PROCESSING,
            version: executionVersion,
          },
          {
            modifiedAt,
            // TypeORM automatically increments @VersionColumn on partial updates unless the
            // version is explicitly assigned. A heartbeat must renew time without changing epoch.
            version: () => 'version',
          }
        );
        if (!affected) {
          ownershipError = new TriggerExecutionOwnershipError(trigger.id, executionVersion);
          throw ownershipError;
        }
        trigger.modifiedAt = modifiedAt;
      } catch (error) {
        ownershipError =
          error instanceof TriggerExecutionOwnershipError
            ? error
            : new TriggerExecutionOwnershipError(trigger.id, executionVersion, error);
        throw ownershipError;
      }
    };

    const intervalId = setInterval(() => {
      if (stopped || heartbeat) return;
      heartbeat = assertOwned()
        .catch(error => {
          this.logger.warn(
            `Lost execution ownership for Data Quality trigger ${trigger.id}: ${error.message}`
          );
        })
        .finally(() => {
          heartbeat = null;
        });
    }, EXECUTION_OWNERSHIP_HEARTBEAT_INTERVAL_MS);

    return {
      ownership: { assertOwned },
      stop: async () => {
        stopped = true;
        clearInterval(intervalId);
        await heartbeat;
      },
    };
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

  protected override async terminalizeOrphanedRun(
    run: DataMartRun,
    error: string,
    finishedAt: Date
  ): Promise<boolean> {
    return this.dataQualityRunService.terminalizeOrphanedRun(run.id, error, finishedAt);
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
