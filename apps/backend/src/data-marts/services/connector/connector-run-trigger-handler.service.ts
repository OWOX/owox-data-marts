import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
import { DataMartRunType } from '../../enums/data-mart-run-type.enum';
import { ConnectorExecutionService } from './connector-execution.service';
import { DataMartRunService } from '../data-mart-run.service';
import { DataMartService } from '../data-mart.service';
import { BaseRunTriggerHandlerService } from '../base-run-trigger-handler.service';
import { ConnectorMessageType } from '../../connector-types/enums/connector-message-type-enum';
import { buildNextBackfillChunkPayload } from '../../utils/manual-backfill-range';

/**
 * Terminal statuses after which the next chunk of a split manual backfill is started.
 * FAILED continues by product decision (later periods still load; the failed one stays
 * visible in Run History). CANCELLED and RESTRICTED stop the chain; INTERRUPTED is resumed
 * by the interrupted-run sweep and reaches this decision again once it finishes.
 */
const BACKFILL_CHAIN_CONTINUE_STATUSES: readonly DataMartRunStatus[] = [
  DataMartRunStatus.SUCCESS,
  DataMartRunStatus.FAILED,
];

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

      run = await this.claimRunSlotAtomically(trigger, dataMart.projectId);

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
      } else {
        await this.enqueueNextBackfillChunk(dataMart, run.id);
      }
    } catch (error) {
      if (error instanceof ConcurrencyLimitExceededException) {
        this.logger.log(
          `Concurrency limit reached for project ${trigger.projectId}, trigger ${trigger.id} will retry`
        );
        trigger.status = TriggerStatus.IDLE;
        trigger.isActive = true;
        await this.repository.save(trigger);
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
    projectId: string
  ): Promise<DataMartRun> {
    const maxRuns = this.configService.get<number>('MAX_CONNECTOR_RUNS_PER_PROJECT', 3);

    return this.dataSource.transaction(async manager => {
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

  /**
   * Split manual backfills are processed strictly one chunk at a time: the next run is
   * created only here, after the previous one reached a terminal status, and goes through
   * the regular run creation path (already-running guard, run row, trigger).
   */
  private async enqueueNextBackfillChunk(dataMart: DataMart, runId: string): Promise<void> {
    const finishedRun = await this.dataMartRunService.findById(runId);
    if (!finishedRun || !BACKFILL_CHAIN_CONTINUE_STATUSES.includes(finishedRun.status)) {
      return;
    }

    const nextPayload = buildNextBackfillChunkPayload(finishedRun.additionalParams?.payload);
    if (!nextPayload) {
      return;
    }

    const { chunkIndex, totalChunks } = nextPayload.backfillChain;
    const logMeta = { dataMartId: dataMart.id, projectId: dataMart.projectId, runId };
    try {
      const nextRunId = await this.connectorExecutionService.run(
        dataMart,
        finishedRun.createdById ?? 'system',
        finishedRun.runType,
        nextPayload
      );
      this.logger.log(
        `Enqueued backfill run ${chunkIndex + 1}/${totalChunks} (${nextRunId}) after run ${runId}`,
        logMeta
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const message = `Failed to start backfill run ${chunkIndex + 1}/${totalChunks} (${nextPayload.data.StartDate} - ${nextPayload.data.EndDate}): ${reason}`;
      this.logger.error(message, error instanceof Error ? error.stack : undefined, logMeta);
      // The finished run is the only place the user will look, so record why the chain stopped.
      await this.dataMartRunRepository.update(
        { id: runId },
        {
          errors: [
            ...(finishedRun.errors ?? []),
            JSON.stringify({
              type: ConnectorMessageType.ERROR,
              at: new Date().toISOString(),
              error: message,
            }),
          ],
        }
      );
    }
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
