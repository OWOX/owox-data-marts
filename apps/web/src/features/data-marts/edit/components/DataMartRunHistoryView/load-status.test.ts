import { describe, expect, it } from 'vitest';
import { aggregateLoadStatus, describeBackfillStatus } from './load-status';
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

const segmentMarker = (
  index: number,
  phase: 'completed' | 'failed',
  loadedThrough?: string
): LogEntry => ({
  id: `seg-${String(index)}-${phase}`,
  level: LogLevel.INFO,
  message: `Segment ${String(index)}`,
  timestamp: 'N/A',
  category: LogCategory.ANALYTICS,
  severity: LogSeverity.MUTED,
  metadata: {
    metric: 'backfill_segment',
    value: index,
    phase,
    segmentStart: '2024-03-03',
    segmentEnd: '2024-04-02',
    backfillStart: '2024-01-01',
    backfillEnd: '2025-06-30',
    segmentsTotal: 18,
    ...(loadedThrough ? { loadedThrough } : {}),
  },
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

  it('shows a run that loaded nothing as 0 rows, not as no status', () => {
    expect(
      aggregateLoadStatus([
        metricEntry('rows_extracted', 0, 'raw_data'),
        metricEntry('rows_written', 0, 'raw_data'),
      ])
    ).toEqual({
      rowsExtracted: 0,
      rowsWritten: 0,
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

describe('backfill segments', () => {
  it('counts completed segments and tracks how far the backfill loaded', () => {
    const status = aggregateLoadStatus([
      segmentMarker(1, 'completed', '2024-01-31'),
      segmentMarker(2, 'completed', '2024-03-02'),
    ]);

    expect(status?.backfill).toEqual({
      backfillStart: '2024-01-01',
      backfillEnd: '2025-06-30',
      segmentsTotal: 18,
      segmentsCompleted: 2,
      loadedThrough: '2024-03-02',
      failedSegment: null,
    });
  });

  it('reports the failed segment and what loaded before it', () => {
    const status = aggregateLoadStatus([
      segmentMarker(1, 'completed', '2024-01-31'),
      segmentMarker(2, 'failed', '2024-02-20'),
    ]);

    expect(status?.backfill).toMatchObject({
      segmentsCompleted: 1,
      loadedThrough: '2024-02-20',
      failedSegment: { index: 2, start: '2024-03-03', end: '2024-04-02' },
    });
  });

  it('leaves a run without markers exactly as before', () => {
    expect(aggregateLoadStatus([metricEntry('rows_written', 5)])).not.toHaveProperty('backfill');
    expect(aggregateLoadStatus([])).toBeNull();
  });

  it('describes each state in one line', () => {
    const base = aggregateLoadStatus([segmentMarker(1, 'completed', '2024-01-31')])!.backfill!;

    expect(describeBackfillStatus(base, true)).toBe(
      'Backfill 2024-01-01 – 2025-06-30 · loaded through 2024-01-31 · loading segment 2 of 18'
    );
    expect(describeBackfillStatus(base, false)).toBe(
      'Backfill 2024-01-01 – 2025-06-30 · loaded through 2024-01-31 · 1 of 18 segments completed'
    );
    expect(describeBackfillStatus({ ...base, segmentsCompleted: 18 }, false)).toContain(
      'all 18 segments completed'
    );
    expect(
      describeBackfillStatus(
        { ...base, failedSegment: { index: 2, start: '2024-02-01', end: '2024-03-02' } },
        false
      )
    ).toContain('segment 2 of 18 failed');
  });
});
