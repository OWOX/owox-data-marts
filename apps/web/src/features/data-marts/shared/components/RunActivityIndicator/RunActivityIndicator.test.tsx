// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RunActivityIndicator } from './RunActivityIndicator';
import { getDataMartRunActivityLabel, isDataQualityActivityState } from './run-activity';

describe('RunActivityIndicator', () => {
  it('keeps inactive content mounted for the exit transition while making it inert', () => {
    const onViewRuns = vi.fn();
    const { container, rerender } = render(
      <RunActivityIndicator active label='Checking data quality' onViewRuns={onViewRuns} />
    );
    const status = screen.getByRole('status');

    rerender(
      <RunActivityIndicator active={false} label='Checking data quality' onViewRuns={onViewRuns} />
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View runs' })).not.toBeInTheDocument();
    expect(container.querySelector('[role="status"]')).toBe(status);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstElementChild).toHaveAttribute('inert');
    expect(container.firstElementChild).toHaveClass(
      'motion-safe:transition-all',
      'max-w-0',
      'opacity-0'
    );
    const button = container.querySelector('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('tabindex', '-1');
    fireEvent.click(button!);
    expect(onViewRuns).not.toHaveBeenCalled();
  });

  it('renders the active label and opens Run History', () => {
    const onViewRuns = vi.fn();

    render(
      <RunActivityIndicator
        active
        label='Checking data quality'
        onViewRuns={onViewRuns}
        separator
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('Checking data quality');
    fireEvent.click(screen.getByRole('button', { name: 'View runs' }));
    expect(onViewRuns).toHaveBeenCalledTimes(1);
  });
});

describe('Data Quality run activity helpers', () => {
  it('treats only queued and running quality states as active', () => {
    expect(isDataQualityActivityState('QUEUED')).toBe(true);
    expect(isDataQualityActivityState('RUNNING')).toBe(true);

    for (const state of [
      'NEVER_RUN',
      'PASSED',
      'ISSUES',
      'EXECUTION_FAILED',
      'RESTRICTED',
      'CANCELLED',
      'ALL_DISABLED',
      undefined,
    ] as const) {
      expect(isDataQualityActivityState(state)).toBe(false);
    }
  });

  it('builds the activity label for data and quality run combinations', () => {
    for (const [hasDataUpdate, hasDataQuality, expected] of [
      [false, false, null],
      [true, false, 'Updating data'],
      [false, true, 'Checking data quality'],
      [true, true, 'Runs in progress'],
    ] as const) {
      expect(getDataMartRunActivityLabel(hasDataUpdate, hasDataQuality)).toBe(expected);
    }
  });
});
