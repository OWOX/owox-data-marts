import { describe, expect, it } from 'vitest';
import { aggregateLoadStatus } from './load-status';
import type { LogEntry } from './types';
import { LogLevel } from './types';
import { LogCategory, LogSeverity } from './log-category';

const metricEntry = (metric: string | null, value: number | null, node?: string): LogEntry => ({
  id: `e-${String(metric)}-${String(value)}-${node ?? ''}`,
  level: LogLevel.INFO,
  message: 'x',
  timestamp: 'N/A',
  category: LogCategory.ANALYTICS,
  severity: LogSeverity.MUTED,
  metadata: { metric, value, node: node ?? null },
});

const dateEntry = (date: string): LogEntry => ({
  id: `d-${date}`,
  level: LogLevel.INFO,
  message: date,
  timestamp: 'N/A',
  category: LogCategory.STATE,
  severity: LogSeverity.MUTED,
  metadata: { type: 'updateLastRequstedDate', date },
});

describe('aggregateLoadStatus', () => {
  it('sums rows_extracted and rows_written separately, no node count', () => {
    expect(
      aggregateLoadStatus([
        metricEntry('rows_extracted', 16000, 'coins'),
        metricEntry('rows_written', 4000, 'coins'),
        metricEntry('rows_written', 250, 'coins'),
      ])
    ).toEqual({
      rowsExtracted: 16000,
      rowsWritten: 4250,
      hasExtracted: true,
      processingDate: null,
    });
  });

  it('reports hasExtracted false when only rows_written is present', () => {
    expect(aggregateLoadStatus([metricEntry('rows_written', 100, 'x')])).toEqual({
      rowsExtracted: 0,
      rowsWritten: 100,
      hasExtracted: false,
      processingDate: null,
    });
  });

  it('takes the maximum processing date and shows status even without row metrics', () => {
    expect(
      aggregateLoadStatus([
        dateEntry('2026-05-10'),
        dateEntry('2026-05-14'),
        dateEntry('2026-05-12'),
      ])
    ).toEqual({
      rowsExtracted: 0,
      rowsWritten: 0,
      hasExtracted: false,
      processingDate: '2026-05-14',
    });
  });

  it('ignores unrelated metrics and returns null when nothing relevant', () => {
    expect(aggregateLoadStatus([metricEntry('something_else', 999, 'x')])).toBeNull();
    expect(aggregateLoadStatus([])).toBeNull();
  });
});
