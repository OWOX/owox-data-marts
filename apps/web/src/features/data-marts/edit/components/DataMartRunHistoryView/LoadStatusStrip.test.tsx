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
});
