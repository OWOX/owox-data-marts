import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@owox/ui/components/alert-dialog';
import { Button } from '@owox/ui/components/button';
import { type ColumnDef, type Row } from '@tanstack/react-table';
import { CircleCheckBig, Import, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
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
import { DataMartStatus } from '../../../shared';
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
import { RunDataQualityBatchDialog } from '../RunDataQualityBatchDialog';

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

  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPublishConfirmation, setShowPublishConfirmation] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showBulkCreateFromStorage, setShowBulkCreateFromStorage] = useState(false);
  const [showRunQuality, setShowRunQuality] = useState(false);
  const [qualityBatchDataMarts, setQualityBatchDataMarts] = useState<DataMartListItem[]>([]);

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
  const selectedDraftRows = selectedRows.filter(
    row => (row.original as DataMartListItem).status.code === DataMartStatus.DRAFT
  );
  const hasSelectedDrafts = selectedDraftRows.length > 0;

  const handleBatchDelete = async () => {
    try {
      setIsDeleting(true);

      const selectedRows = table.getSelectedRowModel().rows;
      const selectedIds = selectedRows.map(row => (row.original as { id: string }).id);

      for (const id of selectedIds) {
        await deleteDataMart(id);
      }

      toast.success(
        `Successfully deleted ${String(selectedIds.length)} data mart${selectedIds.length !== 1 ? 's' : ''}`
      );
      table.resetRowSelection();
      await refetchDataMarts();
    } catch (error) {
      console.error('Error deleting data marts:', error);
      toast.error('Failed to delete some data marts. Please try again.');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirmation(false);
    }
  };

  const handleBatchPublish = async () => {
    try {
      setIsPublishing(true);

      const draftIds = selectedDraftRows.map(row => (row.original as { id: string }).id);

      let successCount = 0;

      for (const id of draftIds) {
        try {
          await publishDataMart(id);
          successCount++;
        } catch (error) {
          console.error(`Error publishing data mart ${id}:`, error);
        }
      }

      if (successCount > 0) {
        toast.success(
          `Successfully published ${String(successCount)} data mart${successCount !== 1 ? 's' : ''}`,
          { duration: 10000 }
        );
      }

      const failedCount = draftIds.length - successCount;
      if (failedCount > 0) {
        toast.error(
          `Failed to publish ${String(failedCount)} data mart${failedCount !== 1 ? 's' : ''}. Please check ${failedCount !== 1 ? 'them' : 'it'} independently.`,
          { duration: 10000 }
        );
      }

      table.resetRowSelection();
      await refetchDataMarts();
    } finally {
      setIsPublishing(false);
      setShowPublishConfirmation(false);
    }
  };

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
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => {
                      setShowDeleteConfirmation(true);
                    }}
                    disabled={isDeleting}
                    title='Delete selected data marts'
                  >
                    <Trash2 className='h-4 w-4' />
                    <span className='hidden md:block'>Delete</span>
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => {
                      setShowPublishConfirmation(true);
                    }}
                    disabled={!hasSelectedDrafts || isPublishing}
                    title='Publish selected data marts'
                  >
                    <CircleCheckBig className='h-4 w-4' />
                    <span className='hidden md:block'>Publish</span>
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => {
                      setQualityBatchDataMarts(
                        selectedRows.map(row => row.original as DataMartListItem)
                      );
                      setShowRunQuality(true);
                    }}
                    title='Run Data Quality for selected data marts'
                    data-testid='run-selected-data-quality'
                  >
                    <ShieldCheck className='h-4 w-4' />
                    <span className='hidden md:block'>Run Quality</span>
                  </Button>
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

        <RunDataQualityBatchDialog
          open={showRunQuality}
          onOpenChange={next => {
            setShowRunQuality(next);
            if (!next) setQualityBatchDataMarts([]);
          }}
          dataMarts={qualityBatchDataMarts}
          projectId={projectId}
          onCompleted={refetchDataMarts}
        />

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={showDeleteConfirmation} onOpenChange={setShowDeleteConfirmation}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                <span className='mt-2 block space-y-2'>
                  <span className='block'>
                    You're about to delete{' '}
                    <strong>
                      {Object.keys(table.getState().rowSelection).length} selected data mart
                      {Object.keys(table.getState().rowSelection).length !== 1 ? 's' : ''}
                    </strong>
                    . This action cannot be undone.
                  </span>
                  {selectedRows.some(
                    row =>
                      (row.original as DataMartListItem).storageType ===
                      DataStorageType.LEGACY_GOOGLE_BIGQUERY
                  ) && (
                    <span className='text-destructive block'>
                      Some of the selected data marts will also become unavailable in the Google
                      Sheets extension because they use legacy BigQuery storage.
                    </span>
                  )}
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  void handleBatchDelete();
                }}
                disabled={isDeleting}
                className='bg-destructive hover:bg-destructive/90'
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Publish Confirmation Dialog */}
        <AlertDialog open={showPublishConfirmation} onOpenChange={setShowPublishConfirmation}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Publish Draft Data Marts?</AlertDialogTitle>
              <AlertDialogDescription>
                You're about to publish {selectedDraftRows.length} draft data mart
                {selectedDraftRows.length !== 1 ? 's' : ''}.<br />
                Their schemas will be updated and they will become Published.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPublishing}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  void handleBatchPublish();
                }}
                disabled={isPublishing}
              >
                {isPublishing ? 'Publishing...' : 'Publish'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
