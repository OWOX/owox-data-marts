// @vitest-environment happy-dom
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import { MemoryRouter } from 'react-router';
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
  it('reports only the Data Marts visible on the current page', async () => {
    const onVisibleDataMartIdsChange = vi.fn();
    const dataMarts = Array.from({ length: 20 }, (_, index) =>
      buildDataMart(`mart-${index + 1}`, `Data Mart ${String(index + 1).padStart(2, '0')}`)
    );

    renderTableData(dataMarts, { onVisibleDataMartIdsChange });

    await waitFor(() => {
      expect(onVisibleDataMartIdsChange).toHaveBeenLastCalledWith(
        expect.arrayContaining(dataMarts.slice(0, 15).map(item => item.id))
      );
    });
    const firstPageIds = onVisibleDataMartIdsChange.mock.lastCall?.[0] as string[];
    expect(firstPageIds).toHaveLength(15);

    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }));

    await waitFor(() => {
      const secondPageIds = onVisibleDataMartIdsChange.mock.lastCall?.[0] as string[];
      expect(secondPageIds).toHaveLength(5);
      expect(secondPageIds.some(id => firstPageIds.includes(id))).toBe(false);
    });
  });

  it('keeps selection attached to the same Data Mart when polling reorders rows', async () => {
    const deleteDataMart = vi.fn().mockResolvedValue(undefined);
    const first = buildDataMart('mart-1', 'Orders');
    const second = buildDataMart('mart-2', 'Customers');
    const view = renderTableData([first, second], { deleteDataMart });

    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Select row' })[0]);

    view.rerender(
      renderTableElement([second, { ...first, title: 'Orders refreshed' }], {
        deleteDataMart,
      })
    );
    const trigger = screen.getByTestId('data-mart-bulk-actions-trigger');
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByRole('menuitem', { name: /^Delete/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await vi.waitFor(() => {
      expect(deleteDataMart).toHaveBeenCalledWith('mart-1');
    });
  });

  it('shows selected-item actions in the requested order and preserves availability', () => {
    renderTable(buildDataMart());
    const trigger = selectRowAndOpenActions();

    expect(trigger).toBeVisible();
    expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual([
      'Publish 0 draft Data Marts',
      'Check Quality',
      'Delete 1 Data Mart',
    ]);
    expect(screen.getByRole('menuitem', { name: /^Delete/ })).not.toHaveAttribute('data-disabled');
    expect(screen.getByRole('menuitem', { name: /^Publish/ })).toHaveAttribute('data-disabled');
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

    fireEvent.click(screen.getByRole('menuitem', { name: /^Delete/ }));

    expect(screen.getByRole('heading', { name: 'Are you sure?' })).toBeVisible();
    expect(screen.getByText("You're about to delete 1 selected data mart.")).toBeVisible();
    expect(screen.queryByText(/cannot be undone/i)).not.toBeInTheDocument();
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

    const publishAction = screen.getByRole('menuitem', { name: /^Publish/ });
    expect(publishAction).not.toHaveAttribute('data-disabled');
    fireEvent.click(publishAction);

    expect(screen.getByRole('heading', { name: 'Publish Draft Data Marts?' })).toBeVisible();
  });
});

function renderTable(dataMart: DataMartListItem) {
  return renderTableData([dataMart]);
}

function renderTableData(
  data: DataMartListItem[],
  {
    deleteDataMart = vi.fn(),
    onVisibleDataMartIdsChange,
  }: {
    deleteDataMart?: (id: string) => Promise<void>;
    onVisibleDataMartIdsChange?: (ids: string[]) => void;
  } = {}
) {
  return render(renderTableElement(data, { deleteDataMart, onVisibleDataMartIdsChange }));
}

function renderTableElement(
  data: DataMartListItem[],
  {
    deleteDataMart,
    onVisibleDataMartIdsChange,
  }: {
    deleteDataMart: (id: string) => Promise<void>;
    onVisibleDataMartIdsChange?: (ids: string[]) => void;
  }
) {
  const columns: ColumnDef<DataMartListItem>[] = [
    { accessorKey: 'title', header: 'Title', cell: ({ row }) => row.original.title },
  ];

  return (
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <DataMartTable
          columns={columns}
          data={data}
          connectors={[]}
          deleteDataMart={deleteDataMart}
          publishDataMart={vi.fn()}
          refetchDataMarts={vi.fn().mockResolvedValue(undefined)}
          onVisibleDataMartIdsChange={onVisibleDataMartIdsChange}
        />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

function selectRowAndOpenActions() {
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select row' }));
  const trigger = screen.getByTestId('data-mart-bulk-actions-trigger');
  fireEvent.pointerDown(trigger, {
    button: 0,
    ctrlKey: false,
  });
  return trigger;
}

function buildDataMart(id = 'mart-1', title = 'Orders'): DataMartListItem {
  return {
    id,
    title,
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
    dataLastUpdated: null,
  } as DataMartListItem;
}
