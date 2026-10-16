import { Repository } from 'typeorm';
import { ConnectorMessage } from '../../connector-types/connector-message/schemas/connector-message.schema';
import { ConnectorMessageType } from '../../connector-types/enums/connector-message-type-enum';
import { DataMart } from '../../entities/data-mart.entity';
import { DataMartRun } from '../../entities/data-mart-run.entity';
import { DataMartRunStatus } from '../../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../../enums/data-mart-run-type.enum';
import {
  BackfillChainMeta,
  BackfillDateRange,
  nextSegmentAdditionalParams,
} from '../../utils/manual-backfill-range';
import { ConnectorRunTriggerService } from './connector-run-trigger.service';

/** Run-log metric the web UI reads to show which backfill segment a run is. */
export const BACKFILL_SEGMENT_METRIC = 'backfill_segment';

export type SegmentMarkerPhase = 'started' | 'completed' | 'failed';

/**
 * Why the chain deliberately ended on a run: `finished` — nothing more to load; `stopped` — the
 * rest of the period was left unloaded (the project is restricted).
 */
export type SegmentChainEnd = 'finished' | 'stopped';

export interface SegmentMarkerOutcome {
  /**
   * The earliest last-loaded day among the configurations that reported one; absent when none
   * did. Every day through it was loaded by those configurations.
   */
  readonly loadedThrough?: string;
  /** How many configurations reported a loaded day, out of `configurationsTotal`. */
  readonly configurationsLoaded?: number;
  readonly configurationsTotal?: number;
  /** Whether this segment counts as a run: any of its configurations loaded data. */
  readonly counted?: boolean;
  /** Whether the next segment was queued; absent on the `started` marker. */
  readonly chainContinues?: boolean;
  /** Why the chain deliberately ended on this run; set only when it did. */
  readonly chainEnd?: SegmentChainEnd;
}

function describeLoadedDays(outcome: SegmentMarkerOutcome): string {
  if (!outcome.loadedThrough) return 'no days of this segment were loaded';

  const { configurationsLoaded, configurationsTotal } = outcome;
  const isPartial =
    configurationsLoaded !== undefined &&
    configurationsTotal !== undefined &&
    configurationsLoaded < configurationsTotal;
  const scope = isPartial
    ? ` (${configurationsLoaded} of ${configurationsTotal} configurations)`
    : '';
  return `days through ${outcome.loadedThrough} were loaded${scope}`;
}

/** Names the part of the requested period a stopped chain left unloaded, this segment included. */
function describeUnloadedPeriod(meta: BackfillChainMeta, window: BackfillDateRange): string {
  const isLastSegment = meta.segmentIndex >= meta.segmentsTotal;
  const segments = isLastSegment
    ? `segment ${meta.segmentIndex}`
    : `segments ${meta.segmentIndex}–${meta.segmentsTotal}`;
  return `${segments} (${window.startDate} – ${meta.requestedEnd}) ${isLastSegment ? 'was' : 'were'} not loaded`;
}

/**
 * The run-log entry identifying this run as one segment of a backfill chain. Emitted when the
 * segment starts and again when it ends, so a running segment names itself and a finished one
 * says what it loaded and whether the chain goes on. A segment counts as one run once any of its
 * configurations loads data, like every other run, so the ended message says so; one that loads
 * nothing, or is cancelled or interrupted, does not count.
 */
export function buildSegmentMarker(
  meta: BackfillChainMeta,
  window: BackfillDateRange,
  phase: SegmentMarkerPhase,
  at: string,
  outcome: SegmentMarkerOutcome = {}
): Extract<ConnectorMessage, { type: ConnectorMessageType.LOG }> {
  const period = `${meta.requestedStart} – ${meta.requestedEnd}`;
  const position = `segment ${meta.segmentIndex} of ${meta.segmentsTotal} (${window.startDate} – ${window.endDate})`;

  let message: string;
  switch (phase) {
    case 'started':
      message = `Backfill ${period}: loading ${position}`;
      break;
    case 'completed':
      message = `Backfill ${period}: ${position} completed — counted as 1 run`;
      break;
    case 'failed':
      message =
        outcome.chainEnd === 'stopped'
          ? `Backfill stopped: the project is restricted; ${describeUnloadedPeriod(meta, window)}.`
          : `Backfill ${period}: ${position} failed; ${describeLoadedDays(outcome)}${
              outcome.counted ? ' — counted as 1 run' : ''
            }`;
      break;
  }

  return {
    type: ConnectorMessageType.LOG,
    at,
    metric: BACKFILL_SEGMENT_METRIC,
    value: meta.segmentIndex,
    tags: {
      phase,
      segmentStart: window.startDate,
      segmentEnd: window.endDate,
      backfillStart: meta.requestedStart,
      backfillEnd: meta.requestedEnd,
      segmentsTotal: meta.segmentsTotal,
      ...(outcome.loadedThrough ? { loadedThrough: outcome.loadedThrough } : {}),
      ...(outcome.chainContinues === undefined ? {} : { chainContinues: outcome.chainContinues }),
      ...(outcome.chainEnd ? { chainEnd: outcome.chainEnd } : {}),
    },
    message,
    toFormattedString: () => `[LOG] ${message}`,
  };
}

/**
 * Creates the PENDING run of a backfill chain's next segment and its trigger. Callers run it
 * inside the transaction that decides the chain continues — the executor's terminal write, or
 * the repair sweep — so the run and its trigger are stored together or not at all.
 */
export async function createNextSegmentRun(
  runRepository: Repository<DataMartRun>,
  triggerService: ConnectorRunTriggerService,
  previousRun: DataMartRun,
  dataMart: DataMart,
  meta: BackfillChainMeta,
  window: BackfillDateRange
): Promise<DataMartRun> {
  const additionalParams = nextSegmentAdditionalParams(previousRun.additionalParams, meta, window);
  const nextRun = await runRepository.save(
    runRepository.create({
      dataMartId: previousRun.dataMartId,
      type: DataMartRunType.CONNECTOR,
      definitionRun: dataMart.definition,
      status: DataMartRunStatus.PENDING,
      createdById: previousRun.createdById ?? undefined,
      runType: previousRun.runType,
      logs: [],
      errors: [],
      additionalParams,
    })
  );
  await triggerService.createTrigger({
    dataMartId: previousRun.dataMartId,
    projectId: dataMart.projectId,
    createdById: previousRun.createdById ?? 'system',
    dataMartRunId: nextRun.id,
    runType: previousRun.runType,
    payload: additionalParams,
  });
  return nextRun;
}
