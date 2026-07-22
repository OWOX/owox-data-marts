import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DataQualityCompactSummary } from '../../shared/types';
import { formatDateShort } from '../../../../utils/date-formatters';
import { DataQualityCanvasStatusIcon } from './DataQualityCanvasStatusIcon';

function buildSummary(
  overrides: Partial<DataQualityCompactSummary> = {}
): DataQualityCompactSummary {
  return {
    state: 'PASSED',
    enabledChecks: 3,
    totalChecks: 3,
    passedChecks: 3,
    failedChecks: 0,
    notApplicableChecks: 0,
    errorChecks: 0,
    noticeFindings: 0,
    warningFindings: 0,
    errorFindings: 0,
    violationCount: 0,
    highestSeverity: null,
    dataMartRunId: 'run-1',
    lastRunAt: '2026-07-15T12:00:00.000Z',
    ...overrides,
  };
}

async function openDetails(button: HTMLElement): Promise<HTMLElement> {
  act(() => {
    button.focus();
  });

  const details = await screen.findByRole('region', { name: 'Data Quality checks for Orders' });
  expect(details).toHaveTextContent('Data Quality checks');
  return details;
}

describe('DataQualityCanvasStatusIcon', () => {
  it.each([
    ['never run', buildSummary({ state: 'NEVER_RUN' }), 'text-muted-foreground'],
    ['all disabled', buildSummary({ state: 'ALL_DISABLED' }), 'text-muted-foreground'],
    [
      'all not applicable',
      buildSummary({ state: 'PASSED', notApplicableChecks: 3, passedChecks: 0 }),
      'text-muted-foreground',
    ],
    ['queued', buildSummary({ state: 'QUEUED' }), 'text-primary'],
    ['running', buildSummary({ state: 'RUNNING' }), 'text-primary'],
    ['passed', buildSummary(), 'text-success'],
    [
      'critical findings ahead of warning and notice findings',
      buildSummary({
        state: 'ISSUES',
        errorFindings: 1,
        warningFindings: 1,
        noticeFindings: 1,
        highestSeverity: 'error',
      }),
      'text-destructive',
    ],
    [
      'warning findings ahead of notice findings',
      buildSummary({
        state: 'ISSUES',
        warningFindings: 1,
        noticeFindings: 1,
        highestSeverity: 'warning',
      }),
      'text-warning',
    ],
    [
      'notice findings',
      buildSummary({ state: 'ISSUES', noticeFindings: 1, highestSeverity: 'notice' }),
      'text-notice',
    ],
    ['execution failure', buildSummary({ state: 'EXECUTION_FAILED' }), 'text-destructive'],
    [
      'cancelled run with preserved critical findings',
      buildSummary({ state: 'CANCELLED', errorFindings: 1, highestSeverity: 'error' }),
      'text-muted-foreground',
    ],
    [
      'cancelled run without findings',
      buildSummary({ state: 'CANCELLED' }),
      'text-muted-foreground',
    ],
  ])('uses the expected color for %s', (_name, summary, colorClass) => {
    render(
      <DataQualityCanvasStatusIcon
        dataMartTitle='Orders'
        summary={summary}
        onOpenQuality={vi.fn()}
        onRunQuality={vi.fn().mockResolvedValue(undefined)}
      />
    );

    const button = screen.getByRole('button', { name: /Open Data Quality for Orders/ });
    const colorTarget = button.querySelector('[role="img"]') ?? button;
    expect(colorTarget).toHaveClass(colorClass);
  });

  it.each([
    ['never run', buildSummary({ state: 'NEVER_RUN' }), 'lucide-shield'],
    ['all disabled', buildSummary({ state: 'ALL_DISABLED' }), 'lucide-shield-off'],
    [
      'all not applicable',
      buildSummary({ state: 'PASSED', notApplicableChecks: 3, passedChecks: 0 }),
      'lucide-shield-minus',
    ],
    ['queued', buildSummary({ state: 'QUEUED' }), 'lucide-loader-circle'],
    ['running', buildSummary({ state: 'RUNNING' }), 'lucide-loader-circle'],
    ['passed', buildSummary(), 'lucide-shield-check'],
    [
      'critical findings',
      buildSummary({ state: 'ISSUES', errorFindings: 1, highestSeverity: 'error' }),
      'lucide-shield-alert',
    ],
    [
      'warning findings',
      buildSummary({ state: 'ISSUES', warningFindings: 1, highestSeverity: 'warning' }),
      'lucide-shield-alert',
    ],
    [
      'notice findings',
      buildSummary({ state: 'ISSUES', noticeFindings: 1, highestSeverity: 'notice' }),
      'lucide-shield-alert',
    ],
    ['execution failure', buildSummary({ state: 'EXECUTION_FAILED' }), 'lucide-shield-x'],
    ['cancelled', buildSummary({ state: 'CANCELLED' }), 'lucide-shield-ban'],
  ])('uses the expected 16 px icon for %s', (_name, summary, iconClass) => {
    render(
      <DataQualityCanvasStatusIcon
        dataMartTitle='Orders'
        summary={summary}
        onOpenQuality={vi.fn()}
        onRunQuality={vi.fn().mockResolvedValue(undefined)}
      />
    );

    const icon = screen
      .getByRole('button', { name: /Open Data Quality for Orders/ })
      .querySelector('svg');
    expect(icon).toHaveClass(iconClass, 'size-4');
  });

  it('shows a colored icon and count for every finding severity', () => {
    render(
      <DataQualityCanvasStatusIcon
        dataMartTitle='Orders'
        summary={buildSummary({
          state: 'ISSUES',
          passedChecks: 0,
          failedChecks: 6,
          errorFindings: 3,
          warningFindings: 2,
          noticeFindings: 1,
          highestSeverity: 'error',
        })}
        onOpenQuality={vi.fn()}
        onRunQuality={vi.fn().mockResolvedValue(undefined)}
      />
    );

    const button = screen.getByRole('button', { name: /Open Data Quality for Orders/ });
    const critical = within(button).getByLabelText('3 critical findings');
    const warning = within(button).getByLabelText('2 warning findings');
    const notice = within(button).getByLabelText('1 notice finding');

    expect(critical).toHaveClass('text-destructive');
    expect(warning).toHaveClass('text-warning');
    expect(notice).toHaveClass('text-notice');
    expect(critical).toHaveTextContent('3');
    expect(warning).toHaveTextContent('2');
    expect(notice).toHaveTextContent('1');
    expect(button.querySelectorAll('svg')).toHaveLength(3);
    button.querySelectorAll('svg').forEach(icon => {
      expect(icon).toHaveClass('lucide-shield-alert', 'size-4');
    });
  });

  it('shows execution errors alongside findings from a partially failed run', () => {
    render(
      <DataQualityCanvasStatusIcon
        dataMartTitle='Orders'
        summary={buildSummary({
          state: 'EXECUTION_FAILED',
          passedChecks: 1,
          failedChecks: 2,
          errorChecks: 2,
          errorFindings: 1,
          warningFindings: 1,
          highestSeverity: 'error',
        })}
        onOpenQuality={vi.fn()}
        onRunQuality={vi.fn().mockResolvedValue(undefined)}
      />
    );

    const button = screen.getByRole('button', { name: /Open Data Quality for Orders/ });
    const executionErrors = within(button).getByLabelText('2 execution errors');
    const critical = within(button).getByLabelText('1 critical finding');
    const warning = within(button).getByLabelText('1 warning finding');

    expect(executionErrors).toHaveClass('text-destructive');
    expect(executionErrors.querySelector('svg')).toHaveClass('lucide-shield-x', 'size-4');
    expect(critical.querySelector('svg')).toHaveClass('lucide-shield-alert', 'size-4');
    expect(warning.querySelector('svg')).toHaveClass('lucide-shield-alert', 'size-4');
    expect(button.querySelectorAll('svg')).toHaveLength(3);
  });

  it('omits zero-valued severity indicators from the canvas node', () => {
    render(
      <DataQualityCanvasStatusIcon
        dataMartTitle='Orders'
        summary={buildSummary({
          state: 'ISSUES',
          passedChecks: 1,
          failedChecks: 2,
          errorFindings: 0,
          warningFindings: 2,
          noticeFindings: 0,
          highestSeverity: 'warning',
        })}
        onOpenQuality={vi.fn()}
        onRunQuality={vi.fn().mockResolvedValue(undefined)}
      />
    );

    const button = screen.getByRole('button', { name: /Open Data Quality for Orders/ });
    expect(within(button).getByLabelText('2 warning findings')).toBeInTheDocument();
    expect(within(button).queryByLabelText(/critical finding/)).not.toBeInTheDocument();
    expect(within(button).queryByLabelText(/notice finding/)).not.toBeInTheDocument();
    expect(button.querySelectorAll('svg')).toHaveLength(1);
  });

  it('animates only while quality checks are running', () => {
    const { rerender } = render(
      <DataQualityCanvasStatusIcon
        dataMartTitle='Orders'
        summary={buildSummary({ state: 'QUEUED' })}
        onOpenQuality={vi.fn()}
        onRunQuality={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(
      screen
        .getByRole('button', { name: /Open Data Quality for Orders: Queued/ })
        .querySelector('svg')
    ).not.toHaveClass('animate-spin');

    rerender(
      <DataQualityCanvasStatusIcon
        dataMartTitle='Orders'
        summary={buildSummary({ state: 'RUNNING' })}
        onOpenQuality={vi.fn()}
        onRunQuality={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(
      screen
        .getByRole('button', { name: /Open Data Quality for Orders: Running/ })
        .querySelector('svg')
    ).toHaveClass('animate-spin');
  });

  it('keeps the neutral cancellation glyph when a cancelled run has preserved findings', () => {
    render(
      <DataQualityCanvasStatusIcon
        dataMartTitle='Orders'
        summary={buildSummary({
          state: 'CANCELLED',
          errorFindings: 1,
          highestSeverity: 'error',
        })}
        onOpenQuality={vi.fn()}
        onRunQuality={vi.fn().mockResolvedValue(undefined)}
      />
    );

    const icon = screen
      .getByRole('button', { name: /Open Data Quality for Orders: Cancelled/ })
      .querySelector('svg');
    expect(icon).toHaveClass('lucide-shield-ban');
  });

  it('keeps cancellation label and glyph when every completed check was not applicable', async () => {
    render(
      <DataQualityCanvasStatusIcon
        dataMartTitle='Orders'
        summary={buildSummary({
          state: 'CANCELLED',
          passedChecks: 0,
          totalChecks: 3,
          notApplicableChecks: 3,
        })}
        onOpenQuality={vi.fn()}
        onRunQuality={vi.fn().mockResolvedValue(undefined)}
      />
    );

    const button = screen.getByRole('button', {
      name: 'Open Data Quality for Orders: Cancelled',
    });
    expect(button.querySelector('svg')).toHaveClass('lucide-shield-ban');
    const details = await openDetails(button);
    expect(details).toHaveTextContent('Cancelled');
    expect(details).not.toHaveTextContent('No applicable checks');
  });

  it('keeps the header on one line for long status labels', async () => {
    render(
      <DataQualityCanvasStatusIcon
        dataMartTitle='Orders'
        summary={buildSummary({ state: 'ALL_DISABLED' })}
        onOpenQuality={vi.fn()}
        onRunQuality={vi.fn().mockResolvedValue(undefined)}
      />
    );

    const details = await openDetails(
      screen.getByRole('button', { name: /Open Data Quality for Orders/ })
    );

    expect(details).toHaveClass('w-72', 'max-w-72');
    expect(screen.getByRole('heading', { name: 'Data Quality checks' })).toHaveClass(
      'whitespace-nowrap'
    );
    expect(screen.getByText('All checks disabled')).toHaveClass('whitespace-nowrap');
  });

  it('shows non-overlapping terminal results, findings, and the last checked time on focus', async () => {
    const summary = buildSummary({
      state: 'ISSUES',
      passedChecks: 2,
      failedChecks: 1,
      errorChecks: 1,
      noticeFindings: 1,
      warningFindings: 2,
      errorFindings: 3,
      violationCount: 7,
      highestSeverity: 'error',
    });
    render(
      <DataQualityCanvasStatusIcon
        dataMartTitle='Orders'
        summary={summary}
        onOpenQuality={vi.fn()}
        onRunQuality={vi.fn().mockResolvedValue(undefined)}
      />
    );

    const button = screen.getByRole('button', { name: /Open Data Quality for Orders/ });
    const details = await openDetails(button);
    expect(details).toHaveTextContent('Issues found');
    expect(details).toHaveTextContent('3 enabled');
    expect(details).not.toHaveTextContent('enableds');
    expect(details).toHaveTextContent('2 passed');
    expect(details).not.toHaveTextContent('1 failed');
    expect(details).not.toHaveTextContent('0 not applicable');
    expect(details).toHaveTextContent('1 execution error');
    expect(details).toHaveTextContent('3 critical findings');
    expect(details).toHaveTextContent('2 warning findings');
    expect(details).toHaveTextContent('1 notice finding');
    expect(details).not.toHaveTextContent('7 violations');
    const checkedAt = `Last checked ${formatDateShort(summary.lastRunAt)}`;
    expect(details).toHaveTextContent(checkedAt);
    expect(screen.getByText(checkedAt)).toHaveClass(
      'pt-2',
      'pb-1',
      'font-medium',
      'text-foreground'
    );
  });

  it('hides every counter whose value is zero', async () => {
    render(
      <DataQualityCanvasStatusIcon
        dataMartTitle='Orders'
        summary={buildSummary({
          state: 'NEVER_RUN',
          enabledChecks: 0,
          totalChecks: 0,
          passedChecks: 0,
        })}
        onOpenQuality={vi.fn()}
        onRunQuality={vi.fn().mockResolvedValue(undefined)}
      />
    );

    const button = screen.getByRole('button', { name: /Open Data Quality for Orders/ });
    const details = await openDetails(button);
    expect(details).not.toHaveTextContent('0 enabled');
    expect(details).not.toHaveTextContent('0 passed');
    expect(details).not.toHaveTextContent('0 failed');
    expect(details).not.toHaveTextContent('0 not applicable');
    expect(details).not.toHaveTextContent('0 execution errors');
    expect(details).not.toHaveTextContent('0 critical findings');
    expect(details).not.toHaveTextContent('0 warning findings');
    expect(details).not.toHaveTextContent('0 notice findings');
    expect(details).not.toHaveTextContent('0 violations');
  });

  it('does not present terminal counters as live progress while a run is active', async () => {
    const summary = buildSummary({
      state: 'RUNNING',
      passedChecks: 0,
      failedChecks: 0,
      notApplicableChecks: 0,
      lastRunAt: '2026-07-15T12:00:00.000Z',
    });
    render(
      <DataQualityCanvasStatusIcon
        dataMartTitle='Orders'
        summary={summary}
        onOpenQuality={vi.fn()}
        onRunQuality={vi.fn().mockResolvedValue(undefined)}
      />
    );

    const button = screen.getByRole('button', { name: /Open Data Quality for Orders/ });
    const details = await openDetails(button);
    expect(details).toHaveTextContent('Running');
    expect(details).toHaveTextContent('3 enabled');
    expect(details).toHaveTextContent(
      'Terminal results will be available after this run finishes.'
    );
    expect(details).toHaveTextContent(`Started ${formatDateShort(summary.lastRunAt)}`);
    expect(details).not.toHaveTextContent('0 passed');
    expect(details).not.toHaveTextContent('0 failed');
    expect(details).not.toHaveTextContent('0 not applicable');
  });

  it('opens Quality without bubbling clicks or pointer events to the canvas node', () => {
    const onOpenQuality = vi.fn();
    const onParentClick = vi.fn();
    const onParentPointerDown = vi.fn();
    render(
      <div onClick={onParentClick} onPointerDown={onParentPointerDown}>
        <DataQualityCanvasStatusIcon
          dataMartTitle='Orders'
          summary={buildSummary()}
          onOpenQuality={onOpenQuality}
          onRunQuality={vi.fn().mockResolvedValue(undefined)}
        />
      </div>
    );

    const button = screen.getByRole('button', { name: /Open Data Quality for Orders/ });
    fireEvent.pointerDown(button);
    fireEvent.click(button);

    expect(onOpenQuality).toHaveBeenCalledOnce();
    expect(onParentPointerDown).not.toHaveBeenCalled();
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it('runs quality from the Data Quality checks details without bubbling to the canvas node', async () => {
    const onRunQuality = vi.fn().mockResolvedValue(undefined);
    const onParentClick = vi.fn();
    const onParentPointerDown = vi.fn();
    render(
      <div onClick={onParentClick} onPointerDown={onParentPointerDown}>
        <DataQualityCanvasStatusIcon
          dataMartTitle='Orders'
          summary={buildSummary()}
          onOpenQuality={vi.fn()}
          onRunQuality={onRunQuality}
        />
      </div>
    );

    expect(
      screen.queryByRole('button', { name: 'Run Quality for Orders' })
    ).not.toBeInTheDocument();
    await openDetails(screen.getByRole('button', { name: /Open Data Quality for Orders/ }));
    const runAction = screen.getByRole('button', { name: 'Run Quality for Orders' });
    fireEvent.pointerDown(runAction);
    fireEvent.click(runAction);

    await waitFor(() => {
      expect(onRunQuality).toHaveBeenCalledOnce();
    });
    expect(onParentPointerDown).not.toHaveBeenCalled();
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it.each(['QUEUED', 'RUNNING'] as const)(
    'disables the run action while a quality run is %s',
    async state => {
      render(
        <DataQualityCanvasStatusIcon
          dataMartTitle='Orders'
          summary={buildSummary({ state })}
          onOpenQuality={vi.fn()}
          onRunQuality={vi.fn().mockResolvedValue(undefined)}
        />
      );

      await openDetails(screen.getByRole('button', { name: /Open Data Quality for Orders/ }));

      expect(screen.getByRole('button', { name: 'Run Quality for Orders' })).toBeDisabled();
    }
  );
});
