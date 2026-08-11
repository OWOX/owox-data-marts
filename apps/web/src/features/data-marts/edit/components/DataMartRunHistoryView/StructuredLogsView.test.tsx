// @vitest-environment happy-dom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StructuredLogsView } from './StructuredLogsView';
import { LogCategory, LogSeverity } from './log-category';
import { LogLevel } from './types';
import { parseLogEntry } from './utils';

// Helper: give a happy-dom element a scrollable geometry (happy-dom has no layout).
function makeScrollable(el: HTMLElement, scrollHeight: number, clientHeight: number) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: clientHeight });
}

const at = '2026-05-02T12:00:00.000Z';

describe('StructuredLogsView', () => {
  it('renders a human category label per entry instead of the raw method name', () => {
    const logs = [
      parseLogEntry(JSON.stringify({ type: 'log', at, eventType: 'LOG', message: 'hello' }), 0),
      parseLogEntry(
        JSON.stringify({ type: 'addWarningToCurrentStatus', at, warning: 'careful' }),
        1
      ),
      parseLogEntry(
        JSON.stringify({ type: 'log', at, eventType: 'TRACE', message: '[TRACE] http.request' }),
        2
      ),
    ];

    render(<StructuredLogsView logs={logs} />);

    expect(screen.getByText('Log')).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Trace')).toBeInTheDocument();
    // The raw internal method name must no longer be shown as the label.
    expect(screen.queryByText('addWarningToCurrentStatus')).not.toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText('careful')).toBeInTheDocument();
  });

  it('renders an empty state when there are no logs', () => {
    render(<StructuredLogsView logs={[]} />);
    expect(screen.getByText('No logs found')).toBeInTheDocument();
  });

  it('renders an HTTPS address in a log message as a safe external link', () => {
    render(
      <StructuredLogsView
        logs={[
          {
            id: 'log-1',
            timestamp: '2026-08-18 12:43:25',
            level: LogLevel.ERROR,
            category: LogCategory.ERROR,
            severity: LogSeverity.ERROR,
            message: 'Create a managed license key at https://app.owox.com to enable execution.',
          },
        ]}
      />
    );

    const link = screen.getByRole('link', { name: 'https://app.owox.com' });
    expect(link).toHaveAttribute('href', 'https://app.owox.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('does not render other addresses as links', () => {
    render(
      <StructuredLogsView
        logs={[
          {
            id: 'log-1',
            timestamp: '2026-08-18 12:43:25',
            level: LogLevel.ERROR,
            category: LogCategory.ERROR,
            severity: LogSeverity.ERROR,
            message: 'See https://customer.example.com for details.',
          },
        ]}
      />
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText(/https:\/\/customer\.example\.com/)).toBeInTheDocument();
  });
});

describe('StructuredLogsView — live auto-scroll', () => {
  const at = '2026-05-02T12:00:00.000Z';
  const makeLogs = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      parseLogEntry(JSON.stringify({ type: 'log', at, eventType: 'LOG', message: `line ${i}` }), i)
    );
  const makeEntry = (message: string, index = 0) =>
    parseLogEntry(JSON.stringify({ type: 'log', at, eventType: 'LOG', message }), index);

  it('scrolls to the bottom on new logs when live and pinned to bottom', () => {
    const { container, rerender } = render(<StructuredLogsView logs={makeLogs(2)} isLive={true} />);
    const scroller = container.querySelector<HTMLElement>(
      '[data-testid="structured-logs-scroll"]'
    )!;
    makeScrollable(scroller, 500, 100);
    scroller.scrollTop = 400; // at bottom (500 - 400 - 100 = 0)
    act(() => scroller.dispatchEvent(new Event('scroll')));

    makeScrollable(scroller, 900, 100);
    rerender(<StructuredLogsView logs={makeLogs(6)} isLive={true} />);

    expect(scroller.scrollTop).toBe(900);
  });

  it('does not force-scroll when the user has scrolled up', () => {
    const { container, rerender } = render(<StructuredLogsView logs={makeLogs(2)} isLive={true} />);
    const scroller = container.querySelector<HTMLElement>(
      '[data-testid="structured-logs-scroll"]'
    )!;
    makeScrollable(scroller, 500, 100);
    scroller.scrollTop = 0; // scrolled up
    act(() => scroller.dispatchEvent(new Event('scroll')));

    makeScrollable(scroller, 900, 100);
    rerender(<StructuredLogsView logs={makeLogs(6)} isLive={true} />);

    expect(scroller.scrollTop).toBe(0);
  });

  it('does not auto-scroll when not live', () => {
    const { container, rerender } = render(
      <StructuredLogsView logs={makeLogs(2)} isLive={false} />
    );
    const scroller = container.querySelector<HTMLElement>(
      '[data-testid="structured-logs-scroll"]'
    )!;
    makeScrollable(scroller, 500, 100);
    scroller.scrollTop = 400;
    act(() => scroller.dispatchEvent(new Event('scroll')));

    makeScrollable(scroller, 900, 100);
    rerender(<StructuredLogsView logs={makeLogs(6)} isLive={false} />);

    expect(scroller.scrollTop).toBe(400);
  });

  it('scrolls to the top on new logs when newestFirst and live', () => {
    const first = [makeEntry('a')];
    const { rerender } = render(<StructuredLogsView logs={first} isLive newestFirst />);
    const scroll = screen.getByTestId('structured-logs-scroll');
    Object.defineProperty(scroll, 'scrollHeight', { value: 1000, configurable: true });
    scroll.scrollTop = 500;
    rerender(<StructuredLogsView logs={[makeEntry('b', 1), ...first]} isLive newestFirst />);
    expect(scroll.scrollTop).toBe(0);
  });
});
