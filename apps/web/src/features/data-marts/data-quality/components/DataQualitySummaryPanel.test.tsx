// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataQualitySummaryPanel } from './DataQualitySummaryPanel';
import type { DataQualitySummary } from '../model/types';

const baseSummary: DataQualitySummary = {
  state: 'NEVER_RUN',
  enabledChecks: 0,
  totalChecks: 0,
  passedChecks: 0,
  failedChecks: 0,
  notApplicableChecks: 0,
  errorChecks: 0,
  noticeFindings: 0,
  warningFindings: 0,
  errorFindings: 0,
  violationCount: 0,
  highestSeverity: null,
};

describe('DataQualitySummaryPanel', () => {
  it.each([
    ['NEVER_RUN', 'Quality has not been run yet'],
    ['QUEUED', 'Quality run queued'],
    ['RUNNING', 'Quality checks are running'],
    ['PASSED', 'All enabled checks passed'],
    ['ISSUES', 'Quality issues found'],
    ['EXECUTION_FAILED', 'Quality run failed'],
    ['CANCELLED', 'Quality run cancelled'],
    ['ALL_DISABLED', 'All checks are disabled'],
  ] as const)('renders the %s state', (state, title) => {
    render(<DataQualitySummaryPanel summary={{ ...baseSummary, state }} />);

    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
  });

  it('shows not-applicable and finding counters with the checked time', () => {
    render(
      <DataQualitySummaryPanel
        summary={{
          ...baseSummary,
          state: 'ISSUES',
          totalChecks: 4,
          failedChecks: 2,
          notApplicableChecks: 1,
          warningFindings: 1,
          errorFindings: 1,
          violationCount: 18,
          highestSeverity: 'error',
        }}
        checkedAt='2026-07-15T12:00:00.000Z'
      />
    );

    expect(screen.getByText('2 failed')).toBeInTheDocument();
    expect(screen.getByText('1 not applicable')).toBeInTheDocument();
    expect(screen.getByText('18 violations')).toBeInTheDocument();
    expect(screen.getByText(/Last checked/)).toBeInTheDocument();
  });

  it('derives the dedicated all-not-applicable state', () => {
    render(
      <DataQualitySummaryPanel
        summary={{ ...baseSummary, state: 'PASSED', totalChecks: 2, notApplicableChecks: 2 }}
      />
    );

    expect(screen.getByRole('heading', { name: 'No checks are applicable' })).toBeInTheDocument();
  });
});
