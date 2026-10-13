import type { LogEntry } from './types';

/** Progress of a manual backfill that runs as several segments, read from its run-log markers. */
export interface BackfillStatus {
  backfillStart: string;
  backfillEnd: string;
  segmentsTotal: number;
  segmentsCompleted: number;
  loadedThrough: string | null;
  failedSegment: { index: number; start: string; end: string } | null;
}

export interface LoadStatus {
  rowsExtracted: number;
  rowsWritten: number;
  hasExtracted: boolean;
  processingDate: string | null;
  backfill?: BackfillStatus;
}

/** One line for the strip: the period, how far it loaded and which segment is (or failed) now. */
export function describeBackfillStatus(backfill: BackfillStatus, isRunning: boolean): string {
  const { segmentsTotal: total, segmentsCompleted: completed, failedSegment } = backfill;
  const progress = failedSegment
    ? `segment ${String(failedSegment.index)} of ${String(total)} failed`
    : completed >= total
      ? `all ${String(total)} segments completed`
      : isRunning
        ? `loading segment ${String(completed + 1)} of ${String(total)}`
        : `${String(completed)} of ${String(total)} segments completed`;

  return [
    `Backfill ${backfill.backfillStart} – ${backfill.backfillEnd}`,
    ...(backfill.loadedThrough ? [`loaded through ${backfill.loadedThrough}`] : []),
    progress,
  ].join(' · ');
}

const BACKFILL_SEGMENT_METRIC = 'backfill_segment';

const asText = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

function readBackfillStatus(entries: LogEntry[]): BackfillStatus | undefined {
  let status: BackfillStatus | undefined;

  for (const entry of entries) {
    const meta = entry.metadata;
    if (meta?.metric !== BACKFILL_SEGMENT_METRIC) continue;

    const backfillStart = asText(meta.backfillStart);
    const backfillEnd = asText(meta.backfillEnd);
    const segmentsTotal = Number(meta.segmentsTotal);
    if (!backfillStart || !backfillEnd || !Number.isFinite(segmentsTotal)) continue;

    const loadedThrough = asText(meta.loadedThrough);
    const previous: BackfillStatus = status ?? {
      backfillStart,
      backfillEnd,
      segmentsTotal,
      segmentsCompleted: 0,
      loadedThrough: null,
      failedSegment: null,
    };
    const frontier =
      loadedThrough && (!previous.loadedThrough || loadedThrough > previous.loadedThrough)
        ? loadedThrough
        : previous.loadedThrough;

    status =
      meta.phase === 'failed'
        ? {
            ...previous,
            segmentsTotal,
            loadedThrough: frontier,
            failedSegment: {
              index: Number(meta.value),
              start: asText(meta.segmentStart) ?? '',
              end: asText(meta.segmentEnd) ?? '',
            },
          }
        : {
            ...previous,
            segmentsTotal,
            segmentsCompleted: previous.segmentsCompleted + 1,
            loadedThrough: frontier,
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
