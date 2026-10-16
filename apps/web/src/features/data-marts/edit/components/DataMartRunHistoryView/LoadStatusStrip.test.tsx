// @vitest-environment happy-dom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoadStatusStrip } from './LoadStatusStrip';
import type { LogEntry } from './types';
import { LogLevel } from './types';
import { LogCategory, LogSeverity } from './log-category';

const metric = (m: string, value: number, node = 'x'): LogEntry => ({
  id: `a-${m}-${value}`,
  level: LogLevel.INFO,
  message: 'x',
  timestamp: 'N/A',
  category: LogCategory.ANALYTICS,
  severity: LogSeverity.MUTED,
  metadata: { metric: m, value, node },
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
  loadedThrough?: string,
  chainEnd?: 'finished' | 'stopped'
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
    ...(chainEnd ? { chainEnd } : {}),
  },
});

describe('LoadStatusStrip', () => {
  it('renders Extracted and Loaded thousands-separated, without a node count', () => {
    render(
      <LoadStatusStrip entries={[metric('rows_extracted', 16000), metric('rows_written', 4250)]} />
    );
    const strip = screen.getByTestId('load-status-strip');
    expect(strip).toHaveTextContent('Extracted 16,000');
    expect(strip).toHaveTextContent('Loaded 4,250 rows');
    expect(strip).not.toHaveTextContent('node');
  });

  it('says row for a single row', () => {
    render(<LoadStatusStrip entries={[metric('rows_written', 1)]} />);
    expect(screen.getByTestId('load-status-strip').textContent).toMatch(/Loaded 1 row(?!s)/);
  });

  it('omits the Extracted segment when there are no rows_extracted metrics', () => {
    render(<LoadStatusStrip entries={[metric('rows_written', 100)]} />);
    const strip = screen.getByTestId('load-status-strip');
    expect(strip).not.toHaveTextContent('Extracted');
    expect(strip).toHaveTextContent('Loaded 100 rows');
  });

  it('renders the processing date when present', () => {
    render(<LoadStatusStrip entries={[metric('rows_written', 100), dateEntry('2026-05-14')]} />);
    expect(screen.getByTestId('load-status-strip')).toHaveTextContent('2026-05-14');
  });

  it('renders a duration from startedAt/finishedAt', () => {
    render(
      <LoadStatusStrip
        entries={[metric('rows_written', 100)]}
        startedAt={new Date('2026-05-14T00:00:00.000Z')}
        finishedAt={new Date('2026-05-14T00:02:03.000Z')}
      />
    );
    expect(screen.getByTestId('load-status-strip')).toHaveTextContent('2 min 3 sec');
  });

  it('renders nothing when there are no load metrics', () => {
    const { container } = render(<LoadStatusStrip entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the backfill period, the failed segment and its loaded-through day', () => {
    render(
      <LoadStatusStrip
        entries={[segmentMarker(2, 'started'), segmentMarker(2, 'failed', '2024-02-20')]}
      />
    );

    expect(screen.getByTestId('backfill-progress')).toHaveTextContent(
      'Backfill 2024-01-01 – 2025-06-30 · segment 2 of 18 failed · loaded through 2024-02-20'
    );
  });

  it('says the backfill stopped when the project was restricted', () => {
    render(<LoadStatusStrip entries={[segmentMarker(6, 'failed', undefined, 'stopped')]} />);

    expect(screen.getByTestId('backfill-progress')).toHaveTextContent(
      'segment 6 of 18 failed · backfill stopped'
    );
  });

  it('says the backfill ended, not complete, when its last segment failed', () => {
    render(<LoadStatusStrip entries={[segmentMarker(18, 'failed', '2025-06-10', 'finished')]} />);

    const progress = screen.getByTestId('backfill-progress');
    expect(progress).toHaveTextContent('backfill ended');
    expect(progress).not.toHaveTextContent('backfill complete');
  });

  it('shows the segment being loaded while the run is live', () => {
    render(<LoadStatusStrip entries={[segmentMarker(2, 'started')]} isLive />);

    expect(screen.getByTestId('backfill-progress')).toHaveTextContent('loading segment 2 of 18');
  });

  it('shows no backfill progress for a run without segment markers', () => {
    render(<LoadStatusStrip entries={[metric('rows_written', 100)]} />);

    expect(screen.queryByTestId('backfill-progress')).not.toBeInTheDocument();
  });
});
