import { Button } from '@owox/ui/components/button';
import { type ColumnDef, type Row } from '@tanstack/react-table';
import { Import, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BulkCreateFromStorageDialog } from '../BulkCreateFromStorageDialog';
import { CardSkeleton } from '../../../../../shared/components/CardSkeleton';
import {
  BaseTable,
  TableColumnSearch,
  TableCTAButton,
  TableSelectionCheckbox,
} from '../../../../../shared/components/Table';
import { useBaseTable, useOnboardingVideo, useProjectRoute } from '../../../../../shared/hooks';
import { usePersistentFilters } from '../../../../../shared/hooks/usePersistentFilters';
import { applyFiltersToData } from '../../../../../shared/components/TableFilters/filter-utils';
import { DataStorageType } from '../../../../data-storage';
import { useDataMartHealthStatusPrefetch } from '../../model/hooks/useDataMartHealthStatusPrefetch';
import type { DataMartListItem } from '../../model/types';
import { DataMartColumnKey } from './columns';
import { EmptyDataMartsState } from './components';
import { DataMartsTableFilters } from './components/DataMartsTableFilters';
import {
  buildDataMartsTableFilters,
  dataMartsFilterAccessors,
  type DataMartFilterKey,
} from './components/DataMartsTableFilters.config';
import type { ConnectorListItem } from '../../../../connectors/shared/model/types/connector';
import { PromoBlock } from '../../../../../shared/components/PromoBlock/PromoBlock';
import { GoogleBigQueryIcon } from '../../../../../shared/icons/google-bigquery-icon';
import { DataMartBulkActions } from '../../../shared/components/DataMartBulkActions';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  connectors: ConnectorListItem[];
  deleteDataMart: (id: string) => Promise<void>;
  publishDataMart: (id: string) => Promise<void>;
  refetchDataMarts: () => Promise<void>;
  isLoading?: boolean;
}

export function DataMartTable<TData, TValue>({
  columns,
  data,
  connectors,
  deleteDataMart,
  publishDataMart,
  refetchDataMarts,
  isLoading,
}: DataTableProps<TData, TValue>) {
  const { navigate, scope } = useProjectRoute();
  const { projectId = '' } = useParams<{ projectId: string }>();
  const tableId = 'data-marts-table';

  const filtersConfig = useMemo(
    () => buildDataMartsTableFilters(data as DataMartListItem[], connectors),
    [data, connectors]
  );

  const { appliedState, apply, clear } = usePersistentFilters<DataMartFilterKey>({
    projectId,
    tableId,
    urlParam: 'filters',
    config: filtersConfig,
  });

  const filteredData = useMemo(
    () =>
      applyFiltersToData<DataMartFilterKey, DataMartListItem>(
        data as DataMartListItem[],
        appliedState,
        dataMartsFilterAccessors
      ) as TData[],
    [data, appliedState]
  );

  const [showBulkCreateFromStorage, setShowBulkCreateFromStorage] = useState(false);

  // Show onboarding video if the user has not seen it yet
  const shouldShowOnboarding = !isLoading && data.length === 0;
  useOnboardingVideo({
    storageKey: 'data-mart-empty-state-onboarding-video-shown',
    popoverId: 'video-3-getting-started-with-data-marts',
    shouldShow: shouldShowOnboarding,
  });

  // Compose columns with selection column (feature-specific)
  const columnsWithSelection = useMemo<ColumnDef<TData>[]>(
    () => [
      {
        id: 'select',
        size: 40,
        enableResizing: false,
        header: ({ table }) => (
          <TableSelectionCheckbox
            checked={table.getIsAllPageRowsSelected()}
            ariaLabel='Select all rows on this page'
            onClick={table.getToggleAllPageRowsSelectedHandler()}
            extendedHitArea
          />
        ),
        cell: ({ row }) => (
          <TableSelectionCheckbox
            checked={row.getIsSelected()}
            ariaLabel='Select row'
            onClick={row.getToggleSelectedHandler()}
            extendedHitArea
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      ...(columns as ColumnDef<TData>[]),
    ],
    [columns]
  );

  // Initialize table with shared hook (uses pre-filtered data)
  const { table } = useBaseTable<TData>({
    data: filteredData,
    columns: columnsWithSelection,
    storageKeyPrefix: 'data-mart-list',
    defaultColumnVisibility: {
      triggersCount: false,
      reportsCount: false,
      createdByUser: false,
      businessOwnerUsers: false,
      technicalOwnerUsers: false,
      availableForReporting: false,
      availableForMaintenance: false,
    },
    enableRowSelection: true,
  });

  const selectedRows = table.getSelectedRowModel().flatRows;
  const hasSelectedRows = selectedRows.length > 0;

  // Row click handler with navigation
  const handleRowClick = (row: Row<TData>, e: React.MouseEvent) => {
    if (
      e.target instanceof HTMLElement &&
      (e.target.closest('[role="checkbox"]') ||
        e.target.closest('.actions-cell') ||
        e.target.closest('[role="menuitem"]') ||
        e.target.closest('[data-state="open"]'))
    ) {
      return;
    }
    const id = (row.original as { id: string }).id;
    const url = `/data-marts/${id}/data-setup`;
    const path = scope(url);

    if (e.metaKey || e.ctrlKey) {
      window.open(path, '_blank', 'noopener,noreferrer');
      return;
    }

    navigate(url);
  };

  /**
   * Prefetch health status for visible Data Marts in the table (respects pageSize).
   */
  useDataMartHealthStatusPrefetch({
    table,
    isLoading,
  });

  // Show loading skeleton
  if (isLoading) {
    return (
      <div>
        <CardSkeleton />
      </div>
    );
  }

  // Show empty state
  if (!data.length) {
    return <EmptyDataMartsState />;
  }

  const isPromoImportFromBigQuery =
    data.length === 1 &&
    data.some(
      (row: TData) => (row as DataMartListItem).storageType === DataStorageType.GOOGLE_BIGQUERY
    );

  return (
    <div className='flex flex-col gap-4'>
      <div className='dm-card' data-testid='datamartTable'>
        <BaseTable
          tableId={tableId}
          table={table}
          onRowClick={handleRowClick}
          ariaLabel='Data Marts table'
          renderToolbarLeft={table => (
            <>
              {/* BTNs for selected Rows */}
              {hasSelectedRows && (
                <div className='mr-2 flex items-center gap-2 border-r pr-4'>
                  <DataMartBulkActions
                    dataMarts={selectedRows.map(row => {
                      const dataMart = row.original as DataMartListItem;
                      return {
                        id: dataMart.id,
                        status: dataMart.status.code,
                        storageType: dataMart.storageType,
                      };
                    })}
                    projectId={projectId}
                    deleteDataMart={deleteDataMart}
                    publishDataMart={publishDataMart}
                    onCompleted={refetchDataMarts}
                    onClearDataMarts={() => {
                      table.resetRowSelection();
                    }}
                  />
                </div>
              )}
              {/* Filters */}
              <div data-testid='datamartStatusFilter'>
                <DataMartsTableFilters
                  appliedState={appliedState}
                  config={filtersConfig}
                  onApply={apply}
                  onClear={clear}
                />
              </div>
              {/* Search */}
              <div data-testid='datamartSearchInput'>
                <TableColumnSearch
                  table={table}
                  columnId={DataMartColumnKey.TITLE}
                  placeholder='Search'
                />
              </div>
            </>
          )}
          renderToolbarRight={() => (
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                onClick={() => {
                  setShowBulkCreateFromStorage(true);
                }}
                title='Import data marts from storage resources'
              >
                <Import className='h-4 w-4' />
                <span className='hidden lg:block'>Import…</span>
              </Button>
              <TableCTAButton asChild>
                <Link to={scope('/data-marts/create')}>
                  <Plus className='h-4 w-4' />
                  <span className='hidden lg:block'>New Data Mart</span>
                </Link>
              </TableCTAButton>
            </div>
          )}
        />

        <BulkCreateFromStorageDialog
          open={showBulkCreateFromStorage}
          onOpenChange={setShowBulkCreateFromStorage}
          onCreated={() => {
            void refetchDataMarts();
          }}
        />
      </div>

      {/* Promo block for importing data marts from BigQuery */}
      {isPromoImportFromBigQuery && (
        <PromoBlock
          icon={GoogleBigQueryIcon}
          size='compact'
          title='Use existing BigQuery tables or views'
          description='Automatically create multiple Data Marts from your BigQuery assets in&nbsp;seconds'
          primaryAction={{
            label: 'Create Multiple Data Marts...',
            onClick: () => {
              setShowBulkCreateFromStorage(true);
            },
          }}
          secondaryAction={{
            label: 'Create from a Single Table',
            href: scope('/data-marts/create?preset=table'),
          }}
        />
      )}
    </div>
  );
}
