// @vitest-environment happy-dom
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DataMartTable } from './DataMartTable';
import type { DataMartListItem } from '../../model/types';
import { DataMartStatus } from '../../../shared';

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
  it('shows selected-item actions in the requested order and preserves availability', () => {
    renderTable(buildDataMart());
    const trigger = selectRowAndOpenActions();

    expect(trigger).toBeVisible();
    expect(screen.getByText('1', { selector: '[data-slot="badge"]' })).toHaveClass(
      'bg-muted',
      'text-muted-foreground',
      'rounded-full'
    );
    expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual([
      'Publish',
      'Check Quality',
      'Delete',
    ]);
    expect(screen.getByRole('menuitem', { name: 'Delete' })).not.toHaveAttribute('data-disabled');
    expect(screen.getByRole('menuitem', { name: 'Publish' })).toHaveAttribute('data-disabled');
    expect(screen.getByRole('menuitem', { name: 'Check Quality' })).not.toHaveAttribute(
      'data-disabled'
    );
  });

  it('opens the Check Quality confirmation from the selected-items Actions menu', () => {
    renderTable(buildDataMart());
    selectRowAndOpenActions();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Check Quality' }));

    expect(screen.getByRole('heading', { name: 'Check Data Quality' })).toBeVisible();
    expect(screen.getByText('Run Data Quality checks for 1 selected Data Mart?')).toBeVisible();
  });

  it('opens the Delete confirmation from the selected-items Actions menu', () => {
    renderTable(buildDataMart());
    selectRowAndOpenActions();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    expect(screen.getByRole('heading', { name: 'Are you sure?' })).toBeVisible();
  });

  it('opens the Publish confirmation for a selected draft Data Mart', () => {
    renderTable({
      ...buildDataMart(),
      status: {
        code: DataMartStatus.DRAFT,
        displayName: 'Draft',
        description: 'Draft Data Mart',
      },
    });
    selectRowAndOpenActions();

    const publishAction = screen.getByRole('menuitem', { name: 'Publish' });
    expect(publishAction).not.toHaveAttribute('data-disabled');
    fireEvent.click(publishAction);

    expect(screen.getByRole('heading', { name: 'Publish Draft Data Marts?' })).toBeVisible();
  });
});

function renderTable(dataMart: DataMartListItem) {
  const columns: ColumnDef<DataMartListItem>[] = [
    { accessorKey: 'title', header: 'Title', cell: ({ row }) => row.original.title },
  ];

  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <DataMartTable
          columns={columns}
          data={[dataMart]}
          connectors={[]}
          deleteDataMart={vi.fn()}
          publishDataMart={vi.fn()}
          refetchDataMarts={vi.fn().mockResolvedValue(undefined)}
        />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

function selectRowAndOpenActions() {
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select row' }));
  const trigger = screen.getByRole('button', { name: 'Actions 1' });
  fireEvent.pointerDown(trigger, {
    button: 0,
    ctrlKey: false,
  });
  return trigger;
}

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
