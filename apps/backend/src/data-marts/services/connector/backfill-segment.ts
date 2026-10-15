import { ConnectorMessage } from '../../connector-types/connector-message/schemas/connector-message.schema';
import { ConnectorMessageType } from '../../connector-types/enums/connector-message-type-enum';
import { BackfillChainMeta, BackfillDateRange } from '../../utils/manual-backfill-range';

/** Run-log metric the web UI reads to show which backfill segment a run is. */
export const BACKFILL_SEGMENT_METRIC = 'backfill_segment';

export type SegmentMarkerPhase = 'started' | 'completed' | 'failed';

export interface SegmentMarkerOutcome {
  /** The last day every configuration of this run loaded; absent when any loaded none. */
  readonly loadedThrough?: string;
  /** Whether the next segment was queued; absent on the `started` marker. */
  readonly chainContinues?: boolean;
  /** Why the chain deliberately ended on this run; set only when it did. */
  readonly chainEnd?: 'finished';
}

/**
 * The run-log entry identifying this run as one segment of a backfill chain. Emitted when the
 * segment starts and again when it ends, so a running segment names itself and a finished one
 * says what it loaded and whether the chain goes on. Failed segments are never billed, so the
 * completed message is the one that mentions consumption.
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
      message = outcome.loadedThrough
        ? `Backfill ${period}: ${position} failed; days through ${outcome.loadedThrough} were loaded`
        : `Backfill ${period}: ${position} failed; no days of this segment were loaded`;
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
