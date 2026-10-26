import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Not, Repository } from 'typeorm';
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
import { createNextSegmentRun } from './backfill-segment';
import { SystemTimeService } from '../../../common/scheduler/services/system-time.service';
import {
  BACKFILL_CHAIN_KEY,
  BackfillChainMeta,
  BackfillDateRange,
  getMaxManualBackfillDays,
  isManualBackfillPayload,
  nextBackfillChainStep,
  planBackfillChain,
  prepareManualBackfillPayload,
  readBackfillChainMeta,
  readBackfillProgress,
  unwrapRunPayload,
} from '../../utils/manual-backfill-range';

/** How far back the chain repair sweep looks for a backfill whose next segment never started. */
const CHAIN_REPAIR_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/**
 * Tolerance between the application clock, which stamps `finishedAt`, and the database clock,
 * which stamps `createdAt` of the successor created in the same transaction.
 */
const CHAIN_SUCCESSOR_CLOCK_SLACK_MS = 60 * 1000;

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
      // Legacy: remove with LegacyStorageCredentialReader.
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
   *
   * Candidates are selected by when the segment FINISHED, not when it was created: a segment
   * can run for hours, and a stall happens at its end. Status and run type narrow the scan to
   * what can stall. They cannot decide that no successor exists, though: a CANCELLED or
   * INTERRUPTED successor is outside that status filter, yet it means the chain was stopped or
   * is being resumed, so each candidate is checked for any later run of its data mart.
   */
  async repairBackfillChains(): Promise<void> {
    const cutoff = new Date(this.systemTimeService.now().getTime() - CHAIN_REPAIR_LOOKBACK_MS);
    const recent = await this.dataMartRunRepository.find({
      where: {
        type: DataMartRunType.CONNECTOR,
        // PENDING/RUNNING are alive, INTERRUPTED is resumed by its own sweep, and
        // CANCELLED/RESTRICTED stopped the chain on purpose.
        status: In([DataMartRunStatus.SUCCESS, DataMartRunStatus.FAILED]),
        runType: RunType.manual,
        finishedAt: MoreThanOrEqual(cutoff),
      },
      select: [
        'id',
        'dataMartId',
        'status',
        'runType',
        'createdById',
        'finishedAt',
        'additionalParams',
      ],
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
        const step = nextBackfillChainStep(
          meta,
          {
            segmentSucceeded: run.status === DataMartRunStatus.SUCCESS,
            anyProgressAdvanced: Object.keys(readBackfillProgress(run.additionalParams)).length > 0,
          },
          getMaxManualBackfillDays()
        );
        if (step.action !== 'continue') continue;

        // A successor of any status, or a newer backfill the user started in the gap, means
        // this chain is not stalled: queueing now would resurrect a stopped chain or fork it.
        if (await this.hasLaterRun(run, meta)) continue;

        // A second guard for a run this sweep's snapshot predates. A guard, not a lock: a run
        // started between this check and the insert below leaves two active runs — the same
        // window `run()` has between its own check and insert. The sweep cannot race itself,
        // because system triggers are claimed by one worker at a time.
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

  /**
   * Whether a run created at or after the moment `run` finished shows the chain is not stalled:
   * a later segment of this chain in any status, or a manual backfill the user started since.
   * A scheduled or incremental run in the gap is neither — it leaves the backfill untouched and
   * says nothing about the user's intent, so it must not block the repair for the whole lookback.
   */
  private async hasLaterRun(run: DataMartRun, meta: BackfillChainMeta): Promise<boolean> {
    // Not repairable without a finish time: the sweep cannot tell what came after.
    if (!run.finishedAt) return true;

    const since = new Date(run.finishedAt.getTime() - CHAIN_SUCCESSOR_CLOCK_SLACK_MS);
    const candidates = await this.dataMartRunRepository.find({
      where: {
        dataMartId: run.dataMartId,
        type: DataMartRunType.CONNECTOR,
        id: Not(run.id),
        createdAt: MoreThanOrEqual(since),
      },
      select: ['id', 'additionalParams'],
    });

    return candidates.some(candidate => {
      const candidateMeta = readBackfillChainMeta(candidate.additionalParams);
      // An earlier segment of this chain can fall inside the clock-skew slack; it is not later.
      if (candidateMeta?.id === meta.id) return candidateMeta.segmentIndex > meta.segmentIndex;
      return isManualBackfillPayload(unwrapRunPayload(candidate.additionalParams));
    });
  }

  @Transactional()
  private async queueChainSegment(
    run: DataMartRun,
    meta: BackfillChainMeta,
    window: BackfillDateRange
  ): Promise<string> {
    const nextRun = await createNextSegmentRun(
      this.dataMartRunRepository,
      this.connectorRunTriggerService,
      run,
      run.dataMart,
      meta,
      window
    );
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
