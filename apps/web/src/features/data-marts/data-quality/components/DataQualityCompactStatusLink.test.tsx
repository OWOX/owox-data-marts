// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { formatDateShort } from '../../../../utils/date-formatters';
import { dataQualityQueryKeys } from '../model/use-data-quality-workspace';
import type { DataQualityCompactSummary } from '../model/types';
import { DataQualityCompactStatusLink } from './DataQualityCompactStatusLink';

describe('DataQualityCompactStatusLink', () => {
  it('links Output Schema to Data Quality with a concise visible action', () => {
    const client = createClient();
    renderStatus(client);

    const status = screen.getByText('Data Quality issues found');
    const statusIcon = status.parentElement?.parentElement?.querySelector('.lucide-shield-alert');
    expect(statusIcon?.parentElement).toHaveClass('items-center');
    expect(statusIcon).not.toHaveClass('mt-0.5');
    expect(status.parentElement).toContainElement(screen.getByText(/Last checked/));
    const link = screen.getByRole('link', { name: /Open Data Quality/ });
    expect(link).toHaveAttribute('href', '/ui/project-1/data-marts/mart-1/quality');
    expect(link).toHaveClass('text-muted-foreground');
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('shows the last checked time when the summary has one', () => {
    const client = createClient();
    const summary = buildSummary();
    renderStatus(client, summary);

    expect(
      screen.getByText(`Last checked ${formatDateShort(summary.lastRunAt)}`)
    ).toBeInTheDocument();
  });

  it('does not render a timestamp before the first run', () => {
    const client = createClient();
    renderStatus(
      client,
      buildSummary({ state: 'NEVER_RUN', dataMartRunId: null, lastRunAt: null })
    );

    expect(screen.queryByText(/Last checked|Started|Queued/)).not.toBeInTheDocument();
  });

  it('shows a restricted run', () => {
    const client = createClient();
    renderStatus(client, buildSummary({ state: 'RESTRICTED' }));

    expect(screen.getByText('Data Quality run restricted')).toBeInTheDocument();
  });

  it('reacts to the dedicated summary cache without reloading Data Mart context', async () => {
    const client = createClient();
    renderStatus(client);

    expect(screen.getByText('Data Quality issues found')).toBeInTheDocument();

    act(() => {
      client.setQueryData(dataQualityQueryKeys.summary('project-1', 'mart-1'), {
        dataMartRunId: 'run-2',
        lastRunAt: '2026-07-16T12:00:02.000Z',
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
  client.setQueryData(dataQualityQueryKeys.summary('project-1', 'mart-1'), summary);
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );

  return render(<DataQualityCompactStatusLink projectId='project-1' dataMartId='mart-1' />, {
    wrapper: Wrapper,
  });
}
