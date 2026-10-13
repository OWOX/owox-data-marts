import { ConnectorMessage } from '../../connector-types/connector-message/schemas/connector-message.schema';
import { ConnectorMessageType } from '../../connector-types/enums/connector-message-type-enum';
import {
  BackfillDateRange,
  countBackfillSegments,
  getBackfillSegmentIndex,
} from '../../utils/manual-backfill-range';

/** Run-log metric the web UI reads to show segment progress of a long manual backfill. */
export const BACKFILL_SEGMENT_METRIC = 'backfill_segment';

/** What one configuration contributed to a backfill attempt. */
export interface BackfillConfigOutcome {
  /** The window the connector was asked for; absent when the configuration was not spawned. */
  readonly window?: BackfillDateRange;
  /** The last day loaded for the configuration across all attempts; absent when none was. */
  readonly loadedThrough?: string;
  /** The configuration succeeded and still has days of the requested period to load. */
  readonly hasRemainingWork: boolean;
}

export interface BackfillSegmentSummary {
  readonly requested: BackfillDateRange;
  readonly segmentStart: string;
  readonly segmentEnd: string;
  readonly segmentIndex: number;
  readonly segmentsTotal: number;
  /** The last day loaded by every configuration; absent when any of them has loaded none. */
  readonly loadedThrough?: string;
  readonly hasRemainingWork: boolean;
}

/**
 * Folds the per-configuration outcomes of one attempt into the segment it covered, or
 * undefined when no configuration was spawned (every one had already loaded the whole period).
 */
export function summarizeBackfillSegment(
  outcomes: readonly BackfillConfigOutcome[],
  requested: BackfillDateRange,
  maxDays: number
): BackfillSegmentSummary | undefined {
  const windows = outcomes.flatMap(outcome => (outcome.window ? [outcome.window] : []));
  if (windows.length === 0) return undefined;

  const segmentStart = windows.map(w => w.startDate).reduce((a, b) => (a < b ? a : b));
  const segmentEnd = windows.map(w => w.endDate).reduce((a, b) => (a > b ? a : b));
  // One configuration with nothing loaded leaves the whole backfill without a known frontier.
  const loaded = outcomes.map(outcome => outcome.loadedThrough);
  const loadedThrough = loaded.every(day => day !== undefined)
    ? (loaded as string[]).reduce((a, b) => (a < b ? a : b))
    : undefined;

  return {
    requested,
    segmentStart,
    segmentEnd,
    segmentIndex: getBackfillSegmentIndex(requested, segmentStart, maxDays),
    segmentsTotal: countBackfillSegments(requested, maxDays),
    loadedThrough,
    hasRemainingWork: outcomes.some(outcome => outcome.hasRemainingWork),
  };
}

/**
 * The run-log entry recording how a segment ended. Failed segments are never billed, so the
 * message says what was loaded instead.
 */
export function buildSegmentMarker(
  summary: BackfillSegmentSummary,
  phase: 'completed' | 'failed',
  at: string
): Extract<ConnectorMessage, { type: ConnectorMessageType.LOG }> {
  const position = `Segment ${summary.segmentIndex} of ${summary.segmentsTotal} (${summary.segmentStart} – ${summary.segmentEnd})`;
  const message =
    phase === 'completed'
      ? `${position} completed — counted as 1 run`
      : summary.loadedThrough
        ? `${position} failed; days through ${summary.loadedThrough} were loaded`
        : `${position} failed; no days of the backfill were loaded`;

  return {
    type: ConnectorMessageType.LOG,
    at,
    metric: BACKFILL_SEGMENT_METRIC,
    value: summary.segmentIndex,
    tags: {
      phase,
      segmentStart: summary.segmentStart,
      segmentEnd: summary.segmentEnd,
      backfillStart: summary.requested.startDate,
      backfillEnd: summary.requested.endDate,
      segmentsTotal: summary.segmentsTotal,
      ...(summary.loadedThrough ? { loadedThrough: summary.loadedThrough } : {}),
    },
    message,
    toFormattedString: () => `[LOG] ${message}`,
  };
}
