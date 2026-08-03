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
  it('does not reserve a secondary description line while checks are running', () => {
    render(<DataQualitySummaryPanel summary={{ ...baseSummary, state: 'RUNNING' }} />);

    const heading = screen.getByRole('heading', { name: 'Running checks…' });

    expect(heading.parentElement?.querySelector('p')).toBeNull();
  });

  it('shows non-zero rule and finding counters', () => {
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

    expect(screen.getByText('1 not applicable')).toBeInTheDocument();
    expect(screen.getByText('1 error')).toBeInTheDocument();
    expect(screen.getByText('1 warning')).toBeInTheDocument();
    expect(screen.queryByText('0 passed')).not.toBeInTheDocument();
    expect(screen.getByText(/Last checked/)).toBeInTheDocument();
  });

  it('shows a notice finding counter', () => {
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
  });

  it('uses tonal treatment for passed checks and every finding severity', () => {
    render(
      <DataQualitySummaryPanel
        summary={{
          ...baseSummary,
          state: 'ISSUES',
          enabledChecks: 7,
          passedChecks: 4,
          errorFindings: 1,
          warningFindings: 2,
          noticeFindings: 3,
          highestSeverity: 'error',
        }}
      />
    );

    expect(screen.getByText('1 error')).toHaveClass(
      'border-destructive/40',
      'bg-destructive/10',
      'text-destructive'
    );
    expect(screen.getByText('2 warning')).toHaveClass(
      'border-warning/40',
      'bg-warning/10',
      'text-warning'
    );
    expect(screen.getByText('3 notice')).toHaveClass(
      'border-notice/40',
      'bg-notice/10',
      'text-notice'
    );
    expect(screen.getByText('4 passed')).toHaveClass(
      'border-success/40',
      'bg-success/10',
      'text-success'
    );
    expect(screen.getByText('7 enabled')).not.toHaveClass('bg-destructive/10', 'bg-warning/10');
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
