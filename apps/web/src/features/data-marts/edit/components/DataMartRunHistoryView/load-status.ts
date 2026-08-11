import type { LogEntry } from './types';

export interface LoadStatus {
  rowsExtracted: number;
  rowsWritten: number;
  hasExtracted: boolean;
  processingDate: string | null;
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

  if (!hasExtracted && !hasWritten && processingDate === null) return null;
  return { rowsExtracted, rowsWritten, hasExtracted, processingDate };
}
