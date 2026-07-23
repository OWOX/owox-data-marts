// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RunActivityIndicator } from './RunActivityIndicator';
import { getDataMartRunActivityLabel, isDataQualityActivityState } from './run-activity';

describe('RunActivityIndicator', () => {
  it('does not render when no run is active', () => {
    render(
      <RunActivityIndicator active={false} label='Checking data quality' onViewRuns={vi.fn()} />
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View runs' })).not.toBeInTheDocument();
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
  it.each([
    ['QUEUED', true],
    ['RUNNING', true],
    ['NEVER_RUN', false],
    ['PASSED', false],
    ['ISSUES', false],
    ['EXECUTION_FAILED', false],
    ['CANCELLED', false],
    ['ALL_DISABLED', false],
    [undefined, false],
  ] as const)('maps %s to active=%s', (state, expected) => {
    expect(isDataQualityActivityState(state)).toBe(expected);
  });

  it.each([
    [false, false, null],
    [true, false, 'Updating data'],
    [false, true, 'Checking data quality'],
    [true, true, 'Runs in progress'],
  ] as const)(
    'builds the activity label for dataUpdate=%s and dataQuality=%s',
    (hasDataUpdate, hasDataQuality, expected) => {
      expect(getDataMartRunActivityLabel(hasDataUpdate, hasDataQuality)).toBe(expected);
    }
  );
});
