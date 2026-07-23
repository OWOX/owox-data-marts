// @vitest-environment happy-dom
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DataMartTable } from './DataMartTable';
import type { DataMartListItem } from '../../model/types';

vi.mock('../../../../../shared/hooks', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../../shared/hooks')>();
  return {
    ...actual,
    useOnboardingVideo: vi.fn(),
    useProjectRoute: () => ({
      projectId: 'project-1',
      scope: (path: string) => `/ui/project-1${path}`,
      navigate: vi.fn(),
    }),
  };
});

vi.mock('../../model/hooks/useDataMartHealthStatusPrefetch', () => ({
  useDataMartHealthStatusPrefetch: vi.fn(),
}));

describe('DataMartTable', () => {
  it('opens the Check Quality confirmation from the selected-items toolbar', () => {
    const columns: ColumnDef<DataMartListItem>[] = [
      { accessorKey: 'title', header: 'Title', cell: ({ row }) => row.original.title },
    ];

    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <DataMartTable
            columns={columns}
            data={[buildDataMart()]}
            connectors={[]}
            deleteDataMart={vi.fn()}
            publishDataMart={vi.fn()}
            refetchDataMarts={vi.fn().mockResolvedValue(undefined)}
          />
        </QueryClientProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select row' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check Quality' }));

    expect(screen.getByRole('heading', { name: 'Check Data Quality' })).toBeVisible();
    expect(screen.getByText('Run Data Quality checks for 1 selected Data Mart?')).toBeVisible();
  });
});

function buildDataMart(): DataMartListItem {
  return {
    id: 'mart-1',
    title: 'Orders',
    status: {
      code: 'PUBLISHED',
      displayName: 'Published',
      description: 'Published Data Mart',
    },
    storageType: 'GOOGLE_BIGQUERY',
    triggersCount: 0,
    reportsCount: 0,
    createdByUser: null,
    createdAt: new Date('2026-07-15T12:00:00.000Z'),
    modifiedAt: new Date('2026-07-15T12:00:00.000Z'),
    definitionType: 'SQL',
    connectorSourceName: null,
    businessOwnerUsers: [],
    technicalOwnerUsers: [],
    contexts: [],
    qualitySummary: {
      state: 'NEVER_RUN',
      enabledChecks: 1,
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
      dataMartRunId: null,
      lastRunAt: null,
    },
  } as DataMartListItem;
}
