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
  phase: 'started' | 'completed' | 'failed',
  extra: Record<string, string | number | boolean> = {}
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
    ...extra,
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
  it('identifies the run as one segment and lets the latest marker win', () => {
    const status = aggregateLoadStatus([
      segmentMarker(3, 'started'),
      segmentMarker(3, 'completed', { loadedThrough: '2024-04-02', chainContinues: true }),
    ]);

    expect(status?.backfill).toEqual({
      backfillStart: '2024-01-01',
      backfillEnd: '2025-06-30',
      segmentIndex: 3,
      segmentsTotal: 18,
      segmentStart: '2024-03-03',
      segmentEnd: '2024-04-02',
      phase: 'completed',
      loadedThrough: '2024-04-02',
      chainEnd: null,
    });
  });

  it('reports a failed segment with what it loaded', () => {
    const status = aggregateLoadStatus([
      segmentMarker(2, 'started'),
      segmentMarker(2, 'failed', { loadedThrough: '2024-02-20', chainContinues: true }),
    ]);

    expect(status?.backfill).toMatchObject({
      segmentIndex: 2,
      phase: 'failed',
      loadedThrough: '2024-02-20',
    });
  });

  it('leaves a run without markers exactly as before', () => {
    expect(aggregateLoadStatus([metricEntry('rows_written', 5)])).not.toHaveProperty('backfill');
    expect(aggregateLoadStatus([])).toBeNull();
  });

  it('describes each state in one line', () => {
    const running = aggregateLoadStatus([segmentMarker(3, 'started')])!.backfill!;
    expect(describeBackfillStatus(running, true)).toBe(
      'Backfill 2024-01-01 – 2025-06-30 · loading segment 3 of 18'
    );
    expect(describeBackfillStatus(running, false)).toBe(
      'Backfill 2024-01-01 – 2025-06-30 · segment 3 of 18'
    );

    const completed = aggregateLoadStatus([
      segmentMarker(3, 'completed', { chainContinues: true }),
    ])!.backfill!;
    expect(describeBackfillStatus(completed, false)).toBe(
      'Backfill 2024-01-01 – 2025-06-30 · segment 3 of 18 completed'
    );

    const failed = aggregateLoadStatus([
      segmentMarker(3, 'failed', { loadedThrough: '2024-03-20', chainContinues: true }),
    ])!.backfill!;
    expect(describeBackfillStatus(failed, false)).toBe(
      'Backfill 2024-01-01 – 2025-06-30 · segment 3 of 18 failed · loaded through 2024-03-20'
    );

    const finished = aggregateLoadStatus([
      segmentMarker(18, 'completed', { chainContinues: false, chainEnd: 'finished' }),
    ])!.backfill!;
    expect(describeBackfillStatus(finished, false)).toBe(
      'Backfill 2024-01-01 – 2025-06-30 · segment 18 of 18 completed · backfill complete'
    );
  });

  it('does not call a backfill complete when its last segment failed', () => {
    const ended = aggregateLoadStatus([
      segmentMarker(18, 'failed', {
        loadedThrough: '2025-06-10',
        chainContinues: false,
        chainEnd: 'finished',
      }),
    ])!.backfill!;

    expect(describeBackfillStatus(ended, false)).toBe(
      'Backfill 2024-01-01 – 2025-06-30 · segment 18 of 18 failed · loaded through 2025-06-10 · backfill ended'
    );
  });

  it('says a backfill stopped when the rest of its period was left unloaded', () => {
    const stopped = aggregateLoadStatus([
      segmentMarker(6, 'failed', { chainContinues: false, chainEnd: 'stopped' }),
    ])!.backfill!;

    expect(stopped.chainEnd).toBe('stopped');
    expect(describeBackfillStatus(stopped, false)).toBe(
      'Backfill 2024-01-01 – 2025-06-30 · segment 6 of 18 failed · backfill stopped'
    );
  });

  it('ignores a chain end it does not recognise', () => {
    const status = aggregateLoadStatus([
      segmentMarker(6, 'failed', { chainEnd: 'something_new' }),
    ])!.backfill!;

    expect(status.chainEnd).toBeNull();
  });
});
