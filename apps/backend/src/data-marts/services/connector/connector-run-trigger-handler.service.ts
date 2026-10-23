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
import { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';
import { ConnectorExecutionService } from './connector-execution.service';
import { DataMartRunService } from '../data-mart-run.service';
import { DataMartService } from '../data-mart.service';
import { BaseRunTriggerHandlerService } from '../base-run-trigger-handler.service';
import { STANDARD_REPORT_RUN_TYPES } from '../../utils/data-mart-run-cancellation';
import { countRunningStorageRuns } from '../../utils/count-running-storage-runs';

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

      run = await this.claimRunSlotAtomically(trigger, dataMart);

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
        this.logger.log(`${error.message}, trigger ${trigger.id} will retry`);
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
   * Claims a run slot using optimistic approach: claim first, then verify the limits.
   * 1. Atomically set run status to RUNNING (UPDATE WHERE status=PENDING)
   * 2. Count all RUNNING connector runs for the project
   * 3. On a DuckDB storage, count the other RUNNING connector, report and data quality runs
   *    on the same storage: a load needs the file to itself
   * 4. If over a limit — throw (transaction rolls back, run returns to PENDING)
   *
   * TODO: This approach has a potential race condition under MySQL REPEATABLE READ isolation.
   * Two workers may simultaneously claim slots and both pass the limit check because
   * each transaction doesn't see the other's uncommitted UPDATE. Consider using
   * SELECT ... FOR UPDATE with advisory locks or a semaphore table for strict enforcement.
   */
  private async claimRunSlotAtomically(
    trigger: ConnectorRunTrigger,
    dataMart: DataMart
  ): Promise<DataMartRun> {
    const projectId = dataMart.projectId;
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

      if (
        dataMart.storage.type === DataStorageType.DUCKDB &&
        (await countRunningStorageRuns(
          manager,
          dataMart.storage.id,
          // Looker Studio reads are never claimed: like HTTP Data and MCP they wait in the adapter.
          [DataMartRunType.CONNECTOR, ...STANDARD_REPORT_RUN_TYPES, DataMartRunType.DATA_QUALITY],
          trigger.dataMartRunId
        )) > 0
      ) {
        throw new ConcurrencyLimitExceededException(
          `DuckDB storage ${dataMart.storage.id} has a load or a run reading it in progress`
        );
      }

      return manager.findOneOrFail(DataMartRun, {
        where: { id: trigger.dataMartRunId },
      });
    });
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
