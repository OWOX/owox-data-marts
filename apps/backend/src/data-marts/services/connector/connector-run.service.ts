import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { castError } from '@owox/internal-helpers';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { DataMart } from '../../entities/data-mart.entity';
import { DataMartRun } from '../../entities/data-mart-run.entity';
import { DataMartDefinitionType } from '../../enums/data-mart-definition-type.enum';
import { DataMartRunStatus } from '../../enums/data-mart-run-status.enum';
import { DataMartStatus } from '../../enums/data-mart-status.enum';
import { DataMartRunType } from '../../enums/data-mart-run-type.enum';
import { ConnectorExecutionError } from '../../errors/connector-execution.error';
import { RunType } from '../../../common/scheduler/shared/types';
import { ConnectorRunTriggerService } from './connector-run-trigger.service';
import { ConnectorExecutorService } from './connector-executor.service';
import { SystemTimeService } from '../../../common/scheduler/services/system-time.service';
import {
  BACKFILL_CHAIN_KEY,
  BackfillChainMeta,
  BackfillDateRange,
  getMaxManualBackfillDays,
  nextBackfillChainStep,
  nextSegmentAdditionalParams,
  planBackfillChain,
  prepareManualBackfillPayload,
  readBackfillChainMeta,
  readBackfillProgress,
} from '../../utils/manual-backfill-range';

/** How far back the chain repair sweep looks for a backfill whose next segment never started. */
const CHAIN_REPAIR_LOOKBACK_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ConnectorRunService {
  private readonly logger = new Logger(ConnectorRunService.name);

  constructor(
    @InjectRepository(DataMartRun)
    private readonly dataMartRunRepository: Repository<DataMartRun>,
    private readonly connectorRunTriggerService: ConnectorRunTriggerService,
    private readonly connectorExecutorService: ConnectorExecutorService,
    private readonly systemTimeService: SystemTimeService
  ) {}

  @Transactional()
  async run(
    dataMart: DataMart,
    createdById: string,
    runType: RunType,
    payload?: Record<string, unknown>
  ): Promise<string> {
    this.validateDataMartForConnector(dataMart);
    const isRunning = await this.checkDataMartIsRunning(dataMart);
    if (isRunning) {
      throw new BusinessViolationException(
        'Connector is already running. Please wait until it finishes'
      );
    }

    // Validates the backfill period (format, order) before any row is written, so the caller
    // gets a clear error instead of a failed run.
    const preparedPayload = prepareManualBackfillPayload(payload, this.systemTimeService.now());

    // A backfill longer than one segment runs as a chain of independent runs, one per segment.
    // This run is segment 1: its payload covers only the first window, and the chain metadata
    // carries the requested period so each finished segment can queue the next one.
    const chainPlan = planBackfillChain(preparedPayload, randomUUID());
    const runPayload = chainPlan?.payload ?? preparedPayload;

    const dataMartRun = await this.createDataMartRun(
      dataMart,
      createdById,
      runType,
      runPayload,
      chainPlan?.meta
    );

    await this.connectorRunTriggerService.createTrigger({
      dataMartId: dataMart.id,
      projectId: dataMart.projectId,
      createdById,
      dataMartRunId: dataMartRun.id,
      runType,
      payload: dataMartRun.additionalParams ?? undefined,
    });

    return dataMartRun.id;
  }

  async executeExistingRun(
    dataMart: DataMart,
    run: DataMartRun,
    payload?: Record<string, unknown> | null,
    signal?: AbortSignal
  ): Promise<void> {
    return this.connectorExecutorService.executeInBackground(dataMart, run, payload, signal);
  }

  async getDataMartConnectorRunsByStatus(status: DataMartRunStatus): Promise<DataMartRun[]> {
    return this.dataMartRunRepository.find({
      where: { status, type: DataMartRunType.CONNECTOR },
      relations: ['dataMart', 'dataMart.storage', 'dataMart.storage.credential'],
    });
  }

  async executeInterruptedRuns(): Promise<void> {
    const interruptedRuns = await this.getDataMartConnectorRunsByStatus(
      DataMartRunStatus.INTERRUPTED
    );
    if (interruptedRuns.length === 0) {
      this.logger.log('No interrupted runs found to resume');
      return;
    }

    this.logger.log(`Scheduling ${interruptedRuns.length} interrupted runs for resumption...`);

    for (const run of interruptedRuns) {
      try {
        const claimed = await this.dataMartRunRepository.update(
          { id: run.id, status: DataMartRunStatus.INTERRUPTED },
          { status: DataMartRunStatus.PENDING }
        );

        if (!claimed.affected) {
          this.logger.log(`Skipping resumption of run ${run.id}: no longer INTERRUPTED`, {
            dataMartId: run.dataMartId,
            projectId: run.dataMart.projectId,
            runId: run.id,
          });
          continue;
        }

        await this.connectorRunTriggerService.createTrigger({
          dataMartId: run.dataMartId,
          projectId: run.dataMart.projectId,
          createdById: run.createdById ?? 'system',
          dataMartRunId: run.id,
          runType: run.runType,
          payload: run.additionalParams ?? undefined,
        });

        this.logger.log(`Created trigger for interrupted run ${run.id}`, {
          dataMartId: run.dataMartId,
          projectId: run.dataMart.projectId,
          runId: run.id,
        });
      } catch (error) {
        this.logger.error(
          `Failed to schedule interrupted run ${run.id}: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined,
          { dataMartId: run.dataMartId, projectId: run.dataMart.projectId, runId: run.id }
        );
      }
    }
  }

  /**
   * Queues the next segment of any backfill chain that stalled: its latest segment run ended
   * on its own (SUCCESS or FAILED), the chain rule says it should continue, yet no successor
   * run exists. That happens when the executor's queueing transaction failed, or when an
   * older application version executed the segment and knows nothing about chains. Without
   * this sweep such a backfill would stop silently.
   */
  async repairBackfillChains(): Promise<void> {
    const cutoff = new Date(this.systemTimeService.now().getTime() - CHAIN_REPAIR_LOOKBACK_MS);
    const recent = await this.dataMartRunRepository.find({
      where: { type: DataMartRunType.CONNECTOR, createdAt: MoreThanOrEqual(cutoff) },
      select: ['id', 'dataMartId', 'status', 'runType', 'createdById', 'additionalParams'],
    });

    // The latest segment decides each chain's state; every earlier one already has a successor.
    const latestByChain = new Map<string, { run: DataMartRun; meta: BackfillChainMeta }>();
    for (const run of recent) {
      const meta = readBackfillChainMeta(run.additionalParams);
      if (!meta) continue;
      const current = latestByChain.get(meta.id);
      if (!current || meta.segmentIndex > current.meta.segmentIndex) {
        latestByChain.set(meta.id, { run, meta });
      }
    }

    for (const { run, meta } of latestByChain.values()) {
      try {
        // PENDING/RUNNING are alive, INTERRUPTED is resumed by its own sweep, and
        // CANCELLED/RESTRICTED stopped the chain on purpose.
        if (run.status !== DataMartRunStatus.SUCCESS && run.status !== DataMartRunStatus.FAILED) {
          continue;
        }

        const step = nextBackfillChainStep(
          meta,
          {
            segmentSucceeded: run.status === DataMartRunStatus.SUCCESS,
            anyProgressAdvanced: Object.keys(readBackfillProgress(run.additionalParams)).length > 0,
          },
          getMaxManualBackfillDays()
        );
        if (step.action !== 'continue') continue;

        // Another run of the data mart is active — possibly a successor this sweep's
        // snapshot predates. Never create a second active run.
        const withDataMart = await this.dataMartRunRepository.findOne({
          where: { id: run.id },
          relations: ['dataMart'],
        });
        if (!withDataMart?.dataMart || (await this.checkDataMartIsRunning(withDataMart.dataMart))) {
          continue;
        }

        const nextRunId = await this.queueChainSegment(withDataMart, step.meta, step.window);
        this.logger.log(
          `Repaired backfill chain ${meta.id}: queued segment ${step.meta.segmentIndex} of ${step.meta.segmentsTotal} as run ${nextRunId}`,
          { dataMartId: run.dataMartId, runId: run.id, nextRunId }
        );
      } catch (error) {
        const failure = castError(error);
        this.logger.error(
          `Failed to repair backfill chain ${meta.id}: ${failure.message}`,
          failure.stack,
          { dataMartId: run.dataMartId, runId: run.id }
        );
      }
    }
  }

  @Transactional()
  private async queueChainSegment(
    run: DataMartRun,
    meta: BackfillChainMeta,
    window: BackfillDateRange
  ): Promise<string> {
    const additionalParams = nextSegmentAdditionalParams(run.additionalParams, meta, window);
    const nextRun = await this.dataMartRunRepository.save(
      this.dataMartRunRepository.create({
        dataMartId: run.dataMartId,
        type: DataMartRunType.CONNECTOR,
        definitionRun: run.dataMart.definition,
        status: DataMartRunStatus.PENDING,
        createdById: run.createdById ?? undefined,
        runType: run.runType,
        logs: [],
        errors: [],
        additionalParams,
      })
    );
    await this.connectorRunTriggerService.createTrigger({
      dataMartId: run.dataMartId,
      projectId: run.dataMart.projectId,
      createdById: run.createdById ?? 'system',
      dataMartRunId: nextRun.id,
      runType: run.runType,
      payload: additionalParams,
    });
    return nextRun.id;
  }

  private validateDataMartForConnector(dataMart: DataMart): void {
    if (dataMart.definitionType !== DataMartDefinitionType.CONNECTOR) {
      throw new ConnectorExecutionError('DataMart is not a connector type', undefined, {
        dataMartId: dataMart.id,
        projectId: dataMart.projectId,
      });
    }
    if (dataMart.status !== DataMartStatus.PUBLISHED) {
      throw new ConnectorExecutionError('DataMart is not published', undefined, {
        dataMartId: dataMart.id,
        projectId: dataMart.projectId,
      });
    }
  }

  private async checkDataMartIsRunning(dataMart: DataMart): Promise<boolean> {
    const dataMartRun = await this.dataMartRunRepository.findOne({
      where: {
        dataMartId: dataMart.id,
        status: In([DataMartRunStatus.RUNNING, DataMartRunStatus.PENDING]),
        type: DataMartRunType.CONNECTOR,
      },
    });
    return !!dataMartRun;
  }

  private async createDataMartRun(
    dataMart: DataMart,
    createdById: string,
    runType: RunType,
    payload?: Record<string, unknown>,
    chainMeta?: BackfillChainMeta
  ): Promise<DataMartRun> {
    const dataMartRun = this.dataMartRunRepository.create({
      dataMartId: dataMart.id,
      type: DataMartRunType.CONNECTOR,
      definitionRun: dataMart.definition,
      status: DataMartRunStatus.PENDING,
      createdById,
      runType,
      logs: [],
      errors: [],
      additionalParams: payload
        ? { payload, ...(chainMeta ? { [BACKFILL_CHAIN_KEY]: chainMeta } : {}) }
        : undefined,
    });
    return this.dataMartRunRepository.save(dataMartRun);
  }
}
