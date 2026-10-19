import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  SCHEDULER_FACADE,
  SchedulerFacade,
} from '../../../common/scheduler/shared/scheduler.facade';
import { TriggerStatus } from '../../../common/scheduler/shared/entities/trigger-status';
import { ConcurrencyLimitExceededException } from '../../../common/exceptions/concurrency-limit-exceeded.exception';
import { ConnectorRunTrigger } from '../../entities/connector-run-trigger.entity';
import { DataMartRun } from '../../entities/data-mart-run.entity';
import { DataMart } from '../../entities/data-mart.entity';
import { DataMartRunStatus } from '../../enums/data-mart-run-status.enum';
import { DataMartDefinitionType } from '../../enums/data-mart-definition-type.enum';
import { DataMartStatus } from '../../enums/data-mart-status.enum';
import { DataMartRunType } from '../../enums/data-mart-run-type.enum';
import { lockDataMartConnectorWork } from './connector-work-lifecycle';
import { ConnectorExecutionService } from './connector-execution.service';
import { DataMartRunService } from '../data-mart-run.service';
import { DataMartService } from '../data-mart.service';
import { BaseRunTriggerHandlerService } from '../base-run-trigger-handler.service';

@Injectable()
export class ConnectorRunTriggerHandlerService extends BaseRunTriggerHandlerService<ConnectorRunTrigger> {
  protected readonly logger = new Logger(ConnectorRunTriggerHandlerService.name);

  constructor(
    @InjectRepository(ConnectorRunTrigger)
    private readonly repository: Repository<ConnectorRunTrigger>,
    @InjectRepository(DataMartRun)
    dataMartRunRepository: Repository<DataMartRun>,
    @Inject(SCHEDULER_FACADE)
    schedulerFacade: SchedulerFacade,
    private readonly connectorExecutionService: ConnectorExecutionService,
    private readonly dataMartService: DataMartService,
    dataMartRunService: DataMartRunService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource
  ) {
    super(schedulerFacade, dataMartRunService, dataMartRunRepository);
  }

  async handleTrigger(
    trigger: ConnectorRunTrigger,
    options?: { signal?: AbortSignal }
  ): Promise<void> {
    let dataMart: DataMart;
    let run: DataMartRun;

    try {
      if (await this.cancelTriggerIfRunAlreadyCancelled(trigger)) {
        return;
      }

      dataMart = await this.dataMartService.getByIdAndProjectId(
        trigger.dataMartId,
        trigger.projectId
      );

      run = await this.claimRunSlotAtomically(trigger, dataMart.projectId, dataMart);

      this.logger.log(`Executing connector run ${run.id} for data mart ${trigger.dataMartId}`);

      await this.connectorExecutionService.executeExistingRun(
        dataMart,
        run,
        trigger.payload,
        options?.signal
      );
      if (options?.signal?.aborted) {
        await this.markTriggerAsCancelled(
          trigger,
          `Cancelled run trigger ${trigger.id}: abort signal received for DataMartRun ${trigger.dataMartRunId}`
        );
      }
    } catch (error) {
      if (error instanceof ConcurrencyLimitExceededException) {
        this.logger.log(
          `Concurrency limit reached for project ${trigger.projectId}, trigger ${trigger.id} will retry`
        );
        trigger.status = TriggerStatus.IDLE;
        trigger.isActive = true;
        await this.persistRuntimeState(trigger);
        return;
      }

      const existingRun = await this.dataMartRunService.findById(trigger.dataMartRunId);
      if (existingRun?.status === DataMartRunStatus.RUNNING) {
        this.logger.warn(
          `DataMartRun ${trigger.dataMartRunId} is already RUNNING, skipping duplicate trigger ${trigger.id}`
        );
        return;
      }
      if (existingRun?.status === DataMartRunStatus.CANCELLED) {
        await this.markTriggerAsCancelled(
          trigger,
          `Skipping run trigger ${trigger.id}: DataMartRun ${trigger.dataMartRunId} is already CANCELLED`
        );
        return;
      }

      await this.failDataMartRunSafely(trigger.dataMartRunId, error);
      if (error instanceof ConflictException) {
        trigger.status = TriggerStatus.ERROR;
        trigger.isActive = false;
        await this.persistRuntimeState(trigger);
      }

      this.logger.error(
        `Error processing connector run trigger ${trigger.id}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Claims a run slot using optimistic approach: claim first, then verify the limit.
   * 1. Atomically set run status to RUNNING (UPDATE WHERE status=PENDING)
   * 2. Count all RUNNING runs for the project
   * 3. If over limit — throw (transaction rolls back, run returns to PENDING)
   *
   * TODO: This approach has a potential race condition under MySQL REPEATABLE READ isolation.
   * Two workers may simultaneously claim slots and both pass the limit check because
   * each transaction doesn't see the other's uncommitted UPDATE. Consider using
   * SELECT ... FOR UPDATE with advisory locks or a semaphore table for strict enforcement.
   */
  private async claimRunSlotAtomically(
    trigger: ConnectorRunTrigger,
    projectId: string,
    dataMart: DataMart
  ): Promise<DataMartRun> {
    const maxRuns = this.configService.get<number>('MAX_CONNECTOR_RUNS_PER_PROJECT', 3);

    return this.dataSource.transaction(async manager => {
      await lockDataMartConnectorWork(manager, trigger.dataMartId, projectId);
      const candidate = await manager.findOneOrFail(DataMartRun, {
        where: { id: trigger.dataMartRunId },
      });
      const inputRevision = candidate.additionalParams?.configurationRevision;
      if (
        typeof inputRevision === 'number' &&
        Number.isSafeInteger(inputRevision) &&
        inputRevision > 0
      ) {
        const current = await this.dataMartService.getByIdAndProjectId(
          trigger.dataMartId,
          projectId,
          manager
        );
        if (
          current.revision !== inputRevision ||
          current.status !== DataMartStatus.PUBLISHED ||
          current.definitionType !== DataMartDefinitionType.CONNECTOR
        ) {
          throw new ConflictException(
            'Data Mart configuration changed since this load was queued. Start a new load from the current configuration.'
          );
        }
        Object.assign(dataMart, current);
      }
      const claimResult = await manager.update(
        DataMartRun,
        { id: trigger.dataMartRunId, status: DataMartRunStatus.PENDING },
        { status: DataMartRunStatus.RUNNING }
      );

      if (!claimResult.affected) {
        throw new Error(
          `DataMartRun ${trigger.dataMartRunId} is not in PENDING status, cannot claim`
        );
      }

      const activeCount = await manager
        .createQueryBuilder(DataMartRun, 'run')
        .innerJoin(DataMart, 'dm', 'dm.id = run.dataMartId')
        .where('dm.projectId = :projectId', { projectId })
        .andWhere('run.status = :status', { status: DataMartRunStatus.RUNNING })
        .andWhere('run.type = :type', { type: DataMartRunType.CONNECTOR })
        .getCount();

      if (activeCount >= maxRuns) {
        throw new ConcurrencyLimitExceededException(
          `Project ${projectId} has reached the limit of ${maxRuns} concurrent connector runs`
        );
      }

      return manager.findOneOrFail(DataMartRun, {
        where: { id: trigger.dataMartRunId },
      });
    });
  }

  protected async failOrphanedRun(run: DataMartRun): Promise<void> {
    await this.dataMartRunRepository.update(
      { id: run.id, status: DataMartRunStatus.PENDING },
      {
        status: DataMartRunStatus.FAILED,
        finishedAt: new Date(),
        errors: [
          'The run was not started because the maximum number of concurrent runs for this project was reached. Please wait for the current runs to finish and try again.',
        ],
      }
    );
  }

  protected async failDataMartRunSafely(dataMartRunId: string, error: unknown): Promise<void> {
    try {
      await this.dataMartRunRepository.update(
        { id: dataMartRunId, status: In([DataMartRunStatus.PENDING, DataMartRunStatus.RUNNING]) },
        {
          status: DataMartRunStatus.FAILED,
          finishedAt: new Date(),
          errors: [error instanceof Error ? error.message : String(error)],
        }
      );
    } catch (cleanupError) {
      this.logger.warn(
        `Failed to mark DataMartRun ${dataMartRunId} as FAILED: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`
      );
    }
  }

  async persistRuntimeState(trigger: ConnectorRunTrigger): Promise<boolean> {
    const result = await this.repository.update(
      { id: trigger.id, version: trigger.version },
      { status: trigger.status, isActive: trigger.isActive, version: () => 'version + 1' }
    );
    if (result.affected !== 1) return false;
    trigger.version++;
    return true;
  }

  getTriggerRepository(): Repository<ConnectorRunTrigger> {
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
    return [DataMartRunType.CONNECTOR];
  }

  protected getTriggerEntityClass(): new () => ConnectorRunTrigger {
    return ConnectorRunTrigger;
  }

  protected getTriggerRunIdField(): string {
    return 'dataMartRunId';
  }
}
