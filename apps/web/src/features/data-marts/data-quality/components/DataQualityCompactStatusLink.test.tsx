// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { formatDateShort } from '../../../../utils/date-formatters';
import { dataQualityQueryKeys } from '../model/use-data-quality-workspace';
import type { DataQualityCompactSummary } from '../model/types';
import { DataQualityCompactStatusLink } from './DataQualityCompactStatusLink';

describe('DataQualityCompactStatusLink', () => {
  it('links Output Schema to Data Quality with a concise visible action', () => {
    const client = createClient();
    client.setQueryData(dataQualityQueryKeys.latest('project-1', 'mart-1'), null);
    renderStatus(client);

    const status = screen.getByText('Data Quality issues found');
    const statusIcon = status.parentElement?.parentElement?.querySelector('.lucide-shield-alert');
    expect(statusIcon?.parentElement).toHaveClass('items-center');
    expect(statusIcon).not.toHaveClass('mt-0.5');
    expect(status.parentElement).toContainElement(screen.getByText(/Last checked/));
    const link = screen.getByRole('link', { name: /Open Data Quality/ });
    expect(link).toHaveAttribute('href', '/ui/project-1/data-marts/mart-1/quality');
    expect(link).toHaveClass('text-muted-foreground');
    expect(link.querySelector('.lucide-arrow-right')).not.toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.queryByText('Open Quality')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it.each([
    [
      'never run',
      buildSummary({ state: 'NEVER_RUN', dataMartRunId: null, lastRunAt: null }),
      'lucide-shield',
      'text-muted-foreground',
      'border-muted-foreground/30',
      'Data Quality has not been checked yet',
    ],
    [
      'all disabled',
      buildSummary({ state: 'ALL_DISABLED' }),
      'lucide-shield-off',
      'text-muted-foreground',
      'border-muted-foreground/30',
      'Data Quality checks are disabled',
    ],
    [
      'all not applicable',
      buildSummary({ state: 'PASSED', passedChecks: 0, notApplicableChecks: 2 }),
      'lucide-shield-minus',
      'text-muted-foreground',
      'border-muted-foreground/30',
      'No applicable Data Quality checks',
    ],
    [
      'running',
      buildSummary({ state: 'RUNNING' }),
      'lucide-loader-circle',
      'text-primary',
      'border-brand-blue-500/40',
      'Data Quality check running',
    ],
    [
      'passed',
      buildSummary({
        state: 'PASSED',
        passedChecks: 2,
        failedChecks: 0,
        warningFindings: 0,
        violationCount: 0,
        highestSeverity: null,
      }),
      'lucide-shield-check',
      'text-success',
      'border-success/40',
      'Data Quality checks passed',
    ],
    [
      'critical findings',
      buildSummary({ state: 'ISSUES', errorFindings: 1, highestSeverity: 'error' }),
      'lucide-shield-alert',
      'text-destructive',
      'border-destructive/40',
      'Data Quality issues found',
    ],
    [
      'warning findings',
      buildSummary({ state: 'ISSUES', warningFindings: 1, highestSeverity: 'warning' }),
      'lucide-shield-alert',
      'text-warning',
      'border-warning/50',
      'Data Quality issues found',
    ],
    [
      'notice findings',
      buildSummary({
        state: 'ISSUES',
        noticeFindings: 1,
        warningFindings: 0,
        highestSeverity: 'notice',
      }),
      'lucide-shield-alert',
      'text-notice',
      'border-notice/40',
      'Data Quality issues found',
    ],
    [
      'execution failure',
      buildSummary({ state: 'EXECUTION_FAILED' }),
      'lucide-shield-x',
      'text-destructive',
      'border-destructive/40',
      'Data Quality check failed',
    ],
    [
      'cancelled',
      buildSummary({ state: 'CANCELLED' }),
      'lucide-shield-ban',
      'text-muted-foreground',
      'border-muted-foreground/30',
      'Data Quality check cancelled',
    ],
  ])(
    'matches the canvas icon and color for %s',
    (_name, summary, iconClass, textClass, borderClass, statusLabel) => {
      const client = createClient();
      client.setQueryData(dataQualityQueryKeys.latest('project-1', 'mart-1'), null);
      renderStatus(client, summary);

      const link = screen.getByRole('link', { name: /Open Data Quality/ });
      const statusBlock = link.parentElement;
      const icon = statusBlock?.querySelector(`.${iconClass}`);

      expect(statusBlock).toHaveClass(borderClass);
      expect(icon).toHaveClass('size-5', textClass);
      expect(screen.getByText(statusLabel)).toBeInTheDocument();
      if (summary.state === 'RUNNING') expect(icon).toHaveClass('animate-spin');
    }
  );

  it('shows the last checked time when the summary has one', () => {
    const client = createClient();
    client.setQueryData(dataQualityQueryKeys.latest('project-1', 'mart-1'), null);
    const summary = buildSummary();
    renderStatus(client, summary);

    expect(
      screen.getByText(`Last checked ${formatDateShort(summary.lastRunAt)}`)
    ).toBeInTheDocument();
  });

  it('does not render a timestamp before the first run', () => {
    const client = createClient();
    client.setQueryData(dataQualityQueryKeys.latest('project-1', 'mart-1'), null);
    renderStatus(
      client,
      buildSummary({ state: 'NEVER_RUN', dataMartRunId: null, lastRunAt: null })
    );

    expect(screen.queryByText(/Last checked|Started|Queued/)).not.toBeInTheDocument();
  });

  it('reacts to the shared latest-run cache without reloading Data Mart context', async () => {
    const client = createClient();
    client.setQueryData(dataQualityQueryKeys.latest('project-1', 'mart-1'), null);
    renderStatus(client);

    expect(screen.getByText('Data Quality issues found')).toBeInTheDocument();

    act(() => {
      client.setQueryData(dataQualityQueryKeys.latest('project-1', 'mart-1'), {
        id: 'run-2',
        dataMartRunId: 'run-2',
        summary: {
          state: 'PASSED',
          enabledChecks: 2,
          totalChecks: 2,
          passedChecks: 2,
          failedChecks: 0,
          notApplicableChecks: 0,
          errorChecks: 0,
          noticeFindings: 0,
          warningFindings: 0,
          errorFindings: 0,
          violationCount: 0,
          highestSeverity: null,
        },
        results: [],
        createdAt: '2026-07-16T12:00:00.000Z',
        startedAt: '2026-07-16T12:00:01.000Z',
        finishedAt: '2026-07-16T12:00:02.000Z',
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Data Quality checks passed')).toBeInTheDocument();
      expect(screen.queryByText('Data Quality issues found')).not.toBeInTheDocument();
      expect(
        screen.getByText(`Last checked ${formatDateShort('2026-07-16T12:00:02.000Z')}`)
      ).toBeInTheDocument();
    });
  });
});

function createClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
}

function buildSummary(
  overrides: Partial<DataQualityCompactSummary> = {}
): DataQualityCompactSummary {
  return {
    dataMartRunId: 'run-1',
    lastRunAt: '2026-07-15T12:00:01.000Z',
    state: 'ISSUES',
    enabledChecks: 2,
    totalChecks: 2,
    passedChecks: 1,
    failedChecks: 1,
    notApplicableChecks: 0,
    errorChecks: 0,
    noticeFindings: 0,
    warningFindings: 1,
    errorFindings: 0,
    violationCount: 2,
    highestSeverity: 'warning',
    ...overrides,
  };
}

function renderStatus(client: QueryClient, summary = buildSummary()) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );

  return render(
    <DataQualityCompactStatusLink projectId='project-1' dataMartId='mart-1' summary={summary} />,
    { wrapper: Wrapper }
  );
}
