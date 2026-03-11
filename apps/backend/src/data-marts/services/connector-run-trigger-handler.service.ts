import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { SCHEDULER_FACADE, SchedulerFacade } from '../../common/scheduler/shared/scheduler.facade';
import { TriggerHandler } from '../../common/scheduler/shared/trigger-handler.interface';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';
import { ConcurrencyLimitExceededException } from '../../common/exceptions/concurrency-limit-exceeded.exception';
import { ConnectorRunTrigger } from '../entities/connector-run-trigger.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { ConnectorExecutionService } from './connector-execution.service';
import { DataMartRunService } from './data-mart-run.service';
import { DataMartService } from './data-mart.service';

const ORPHANED_RUN_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const ORPHANED_RUN_GRACE_PERIOD_MS = 10 * 60 * 1000;

@Injectable()
export class ConnectorRunTriggerHandlerService
  implements TriggerHandler<ConnectorRunTrigger>, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ConnectorRunTriggerHandlerService.name);
  private cleanupIntervalId?: ReturnType<typeof setInterval>;

  constructor(
    @InjectRepository(ConnectorRunTrigger)
    private readonly repository: Repository<ConnectorRunTrigger>,
    @InjectRepository(DataMartRun)
    private readonly dataMartRunRepository: Repository<DataMartRun>,
    @Inject(SCHEDULER_FACADE)
    private readonly schedulerFacade: SchedulerFacade,
    private readonly connectorExecutionService: ConnectorExecutionService,
    private readonly dataMartService: DataMartService,
    private readonly dataMartRunService: DataMartRunService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource
  ) {}

  async handleTrigger(
    trigger: ConnectorRunTrigger,
    options?: { signal?: AbortSignal }
  ): Promise<void> {
    let dataMart: DataMart;
    let run: DataMartRun;

    try {
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
    } catch (error) {
      if (error instanceof ConcurrencyLimitExceededException) {
        this.logger.warn(
          `Concurrency limit reached for project ${trigger.projectId}, trigger ${trigger.id} will retry`
        );
        trigger.status = TriggerStatus.IDLE;
        trigger.isActive = true;
        await this.repository.save(trigger);
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

      if (activeCount > maxRuns) {
        throw new ConcurrencyLimitExceededException(
          `Project ${projectId} has reached the limit of ${maxRuns} concurrent connector runs`
        );
      }

      return manager.findOneOrFail(DataMartRun, {
        where: { id: trigger.dataMartRunId },
      });
    });
  }

  private async failDataMartRunSafely(dataMartRunId: string, error: unknown): Promise<void> {
    try {
      const run = await this.dataMartRunService.findById(dataMartRunId);
      if (run && run.status === DataMartRunStatus.PENDING) {
        run.status = DataMartRunStatus.FAILED;
        run.errors = [error instanceof Error ? error.message : String(error)];
        await this.dataMartRunRepository.save(run);
      }
    } catch (cleanupError) {
      this.logger.warn(
        `Failed to mark DataMartRun ${dataMartRunId} as FAILED: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`
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

  async onModuleInit(): Promise<void> {
    await this.schedulerFacade.registerTriggerHandler(this);
    this.cleanupIntervalId = setInterval(
      () => this.cleanupOrphanedRuns(),
      ORPHANED_RUN_CLEANUP_INTERVAL_MS
    );
  }

  onModuleDestroy(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
    }
  }

  /**
   * Finds PENDING DataMartRun records of type CONNECTOR that have no corresponding
   * trigger in connector_run_triggers and marks them as FAILED.
   * This handles the case where a trigger is deleted by TTL cleanup while the run is still pending.
   */
  private async cleanupOrphanedRuns(): Promise<void> {
    try {
      const gracePeriod = new Date(Date.now() - ORPHANED_RUN_GRACE_PERIOD_MS);

      const orphanedRuns = await this.dataMartRunRepository
        .createQueryBuilder('run')
        .leftJoin(ConnectorRunTrigger, 'trigger', 'trigger.dataMartRunId = run.id')
        .where('run.status = :status', { status: DataMartRunStatus.PENDING })
        .andWhere('run.type = :type', { type: DataMartRunType.CONNECTOR })
        .andWhere('run.createdAt <= :gracePeriod', { gracePeriod })
        .andWhere('trigger.id IS NULL')
        .getMany();

      for (const run of orphanedRuns) {
        run.status = DataMartRunStatus.FAILED;
        run.errors = [
          'The run was not started because the maximum number of concurrent runs for this project was reached. Please wait for the current runs to finish and try again.',
        ];
        await this.dataMartRunRepository.save(run);
        this.logger.warn(`Orphaned PENDING connector run ${run.id} marked as FAILED`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to cleanup orphaned connector runs: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
