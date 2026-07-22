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
    ['NEVER_RUN', 'No runs yet'],
    ['QUEUED', 'Run queued…'],
    ['RUNNING', 'Running checks…'],
    ['PASSED', 'All checks passed'],
    ['ISSUES', 'Issues found'],
    ['EXECUTION_FAILED', 'Execution failed'],
    ['CANCELLED', 'Run cancelled'],
    ['ALL_DISABLED', 'All checks are disabled'],
  ] as const)('renders the %s state', (state, title) => {
    render(<DataQualitySummaryPanel summary={{ ...baseSummary, state }} />);

    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
  });

  it('shows non-zero rule and finding counters without a redundant failed total', () => {
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

    expect(screen.queryByText('2 failed')).not.toBeInTheDocument();
    expect(screen.getByText('1 not applicable')).toBeInTheDocument();
    expect(screen.getByText('1 error')).toBeInTheDocument();
    expect(screen.getByText('1 warning')).toBeInTheDocument();
    expect(screen.queryByText('0 passed')).not.toBeInTheDocument();
    expect(screen.queryByText('18 violations')).not.toBeInTheDocument();
    expect(screen.getByText(/Last checked/)).toBeInTheDocument();
  });

  it('does not present a notice-only finding as a destructive failed counter', () => {
    render(
      <DataQualitySummaryPanel
        summary={{
          ...baseSummary,
          state: 'ISSUES',
          enabledChecks: 1,
          totalChecks: 1,
          failedChecks: 1,
          noticeFindings: 1,
          highestSeverity: 'notice',
        }}
      />
    );

    expect(screen.getByText('1 notice')).toBeInTheDocument();
    expect(screen.queryByText('1 failed')).not.toBeInTheDocument();
  });

  it('uses an explicit no-findings chip for passed runs without zero-filled counters', () => {
    render(
      <DataQualitySummaryPanel
        summary={{ ...baseSummary, state: 'PASSED', enabledChecks: 3, passedChecks: 3 }}
      />
    );

    expect(screen.getByText('No findings')).toBeInTheDocument();
    expect(screen.queryByText('0 failed')).not.toBeInTheDocument();
    expect(screen.queryByText('0 not applicable')).not.toBeInTheDocument();
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
