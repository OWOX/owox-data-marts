// @vitest-environment happy-dom
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DataMartTable } from './DataMartTable';
import type { DataMartListItem } from '../../model/types';
import { dataQualityService } from '../../../data-quality/api/data-quality.service';

vi.mock('../../../data-quality/api/data-quality.service', () => ({
  dataQualityService: {
    getConfig: vi.fn(),
  },
}));

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
  it('opens the Run Quality dialog from the selected-items toolbar', async () => {
    vi.mocked(dataQualityService.getConfig).mockResolvedValue({
      savedConfig: null,
      effectiveConfig: { timezone: 'UTC', rules: [] },
      source: 'DEFAULT',
      permissions: { canEdit: false, canRun: false },
      runEligibility: {
        eligible: false,
        code: 'OUTPUT_SCHEMA_REQUIRED',
        activeRunId: null,
      },
      availableChecks: [],
      relationships: [],
    });
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
    fireEvent.click(screen.getByRole('button', { name: 'Run Quality' }));

    expect(screen.getByRole('heading', { name: 'Run Data Quality' })).toBeVisible();
    await waitFor(() => {
      expect(dataQualityService.getConfig).toHaveBeenCalledWith('mart-1');
    });
    expect(screen.getByText('Output Schema required')).toBeVisible();
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
