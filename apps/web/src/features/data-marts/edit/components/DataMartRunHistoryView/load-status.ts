import type { LogEntry } from './types';

/**
 * Which segment of a multi-run backfill this run is, read from its run-log markers. Each
 * segment is its own run: a `started` marker names it, and a terminal marker says how it
 * ended and whether the backfill goes on.
 */
export interface BackfillStatus {
  backfillStart: string;
  backfillEnd: string;
  segmentIndex: number;
  segmentsTotal: number;
  segmentStart: string;
  segmentEnd: string;
  phase: 'started' | 'completed' | 'failed';
  loadedThrough: string | null;
  /** `finished`: nothing more to load; `stopped`: the rest of the period was left unloaded. */
  chainEnd: 'finished' | 'stopped' | null;
}

export interface LoadStatus {
  rowsExtracted: number;
  rowsWritten: number;
  hasExtracted: boolean;
  processingDate: string | null;
  backfill?: BackfillStatus;
}

/** One line for the strip: the period, which segment this run is, and how it went. */
export function describeBackfillStatus(backfill: BackfillStatus, isRunning: boolean): string {
  const segment = `segment ${String(backfill.segmentIndex)} of ${String(backfill.segmentsTotal)}`;
  const progress =
    backfill.phase === 'completed'
      ? `${segment} completed`
      : backfill.phase === 'failed'
        ? `${segment} failed`
        : isRunning
          ? `loading ${segment}`
          : segment;

  return [
    `Backfill ${backfill.backfillStart} – ${backfill.backfillEnd}`,
    progress,
    ...(backfill.phase === 'failed' && backfill.loadedThrough
      ? [`loaded through ${backfill.loadedThrough}`]
      : []),
    ...describeChainEnd(backfill),
  ].join(' · ');
}

/** "Complete" claims every segment loaded, so a last segment that failed says "ended" instead. */
function describeChainEnd(backfill: BackfillStatus): string[] {
  if (backfill.chainEnd === 'stopped') return ['backfill stopped'];
  if (backfill.chainEnd === 'finished') {
    return [backfill.phase === 'failed' ? 'backfill ended' : 'backfill complete'];
  }
  return [];
}

/** Metric of the run-log entry that identifies a run as one segment of a backfill. */
export const BACKFILL_SEGMENT_METRIC = 'backfill_segment';

const asText = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

function readBackfillStatus(entries: LogEntry[]): BackfillStatus | undefined {
  let status: BackfillStatus | undefined;

  // The latest marker wins: `started` first, then the terminal `completed`/`failed` one.
  for (const entry of entries) {
    const meta = entry.metadata;
    if (meta?.metric !== BACKFILL_SEGMENT_METRIC) continue;

    const backfillStart = asText(meta.backfillStart);
    const backfillEnd = asText(meta.backfillEnd);
    const segmentsTotal = Number(meta.segmentsTotal);
    const phase = meta.phase;
    if (
      !backfillStart ||
      !backfillEnd ||
      !Number.isFinite(segmentsTotal) ||
      (phase !== 'started' && phase !== 'completed' && phase !== 'failed')
    ) {
      continue;
    }

    const chainEnd = meta.chainEnd;
    status = {
      backfillStart,
      backfillEnd,
      segmentIndex: Number(meta.value),
      segmentsTotal,
      segmentStart: asText(meta.segmentStart) ?? '',
      segmentEnd: asText(meta.segmentEnd) ?? '',
      phase,
      loadedThrough: asText(meta.loadedThrough),
      chainEnd: chainEnd === 'finished' || chainEnd === 'stopped' ? chainEnd : null,
    };
  }

  return status;
}

/**
 * Aggregate a run's load analytics into a status summary: total rows extracted
 * from the source (`rows_extracted`, declarative only), total rows written to
 * storage (`rows_written`), and the latest processing date (max `lastRequestedDate`
 * for time-series runs). Returns null when the run carries none of these, so the
 * caller can hide the strip (non-connector or catalog-only runs without dates).
 */
export function aggregateLoadStatus(entries: LogEntry[]): LoadStatus | null {
  let rowsExtracted = 0;
  let rowsWritten = 0;
  let hasExtracted = false;
  let hasWritten = false;
  let processingDate: string | null = null;

  for (const entry of entries) {
    const metric = entry.metadata?.metric;
    if (metric === 'rows_extracted' || metric === 'rows_written') {
      const raw = entry.metadata?.value;
      const value = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isFinite(value)) {
        if (metric === 'rows_extracted') {
          rowsExtracted += value;
          hasExtracted = true;
        } else {
          rowsWritten += value;
          hasWritten = true;
        }
      }
    }

    const date = entry.metadata?.date;
    if (
      typeof date === 'string' &&
      date.length > 0 &&
      (processingDate === null || date > processingDate)
    ) {
      processingDate = date;
    }
  }

  const backfill = readBackfillStatus(entries);
  if (!hasExtracted && !hasWritten && processingDate === null && !backfill) return null;
  return {
    rowsExtracted,
    rowsWritten,
    hasExtracted,
    processingDate,
    ...(backfill ? { backfill } : {}),
  };
}
