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
import { Check, CircleCheckBig, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { useContentPopovers } from '../../../../../app/store/hooks/useContentPopovers';
import { storageService } from '../../../../../services';
import { CardSkeleton } from '../../../../../shared/components/CardSkeleton';
import {
  BaseTable,
  TableColumnSearch,
  TableCTAButton,
} from '../../../../../shared/components/Table';
import { useBaseTable, useProjectRoute } from '../../../../../shared/hooks';
import { DataStorageType } from '../../../../data-storage';
import { DataMartStatus } from '../../../shared';
import { useDataMartHealthStatusPrefetch } from '../../model/hooks/useDataMartHealthStatusPrefetch';
import type { DataMartListItem } from '../../model/types';
import { DataMartColumnKey } from './columns';
import { EmptyDataMartsState } from './components';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  deleteDataMart: (id: string) => Promise<void>;
  publishDataMart: (id: string) => Promise<void>;
  refetchDataMarts: () => Promise<void>;
  isLoading?: boolean;
}

export function DataMartTable<TData, TValue>({
  columns,
  data,
  deleteDataMart,
  publishDataMart,
  refetchDataMarts,
  isLoading,
}: DataTableProps<TData, TValue>) {
  const { navigate, scope } = useProjectRoute();

  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPublishConfirmation, setShowPublishConfirmation] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const ONBOARDING_VIDEO_KEY = 'data-mart-empty-state-onboarding-video-shown';
  const { open } = useContentPopovers();

  /**
   * Show onboarding video if the user has not seen it yet
   */
  useEffect(() => {
    if (!isLoading && data.length === 0) {
      const wasShown = storageService.get(ONBOARDING_VIDEO_KEY, 'boolean');

      if (!wasShown) {
        open('video-3-getting-started-with-data-marts');
        storageService.set(ONBOARDING_VIDEO_KEY, true);
      }
    }
  }, [isLoading, data.length, open]);

  // Compose columns with selection column (feature-specific)
  const columnsWithSelection = useMemo<ColumnDef<TData>[]>(
    () => [
      {
        id: 'select',
        size: 40,
        enableResizing: false,
        header: ({ table }) => (
          <button
            type='button'
            role='checkbox'
            aria-checked={table.getIsAllPageRowsSelected()}
            data-state={table.getIsAllPageRowsSelected() ? 'checked' : 'unchecked'}
            aria-label='Select all rows on this page'
            className='peer border-input data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border bg-white shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/8'
            onClick={table.getToggleAllPageRowsSelectedHandler()}
          >
            {table.getIsAllPageRowsSelected() && (
              <span
                data-state='checked'
                data-slot='checkbox-indicator'
                className='pointer-events-none flex items-center justify-center text-current transition-none'
              >
                <Check className='size-3.5 text-white' />
              </span>
            )}
          </button>
        ),
        cell: ({ row }) => (
          <button
            type='button'
            role='checkbox'
            aria-checked={row.getIsSelected()}
            data-state={row.getIsSelected() ? 'checked' : 'unchecked'}
            aria-label='Select row'
            className='peer border-input data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border bg-white shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/8'
            onClick={row.getToggleSelectedHandler()}
          >
            {row.getIsSelected() && (
              <span
                data-state='checked'
                data-slot='checkbox-indicator'
                className='pointer-events-none flex items-center justify-center text-current transition-none'
              >
                <Check className='size-3.5 text-white' />
              </span>
            )}
          </button>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      ...(columns as ColumnDef<TData>[]),
    ],
    [columns]
  );

  // Initialize table with shared hook
  const { table } = useBaseTable<TData>({
    data,
    columns: columnsWithSelection,
    storageKeyPrefix: 'data-mart-list',
    defaultColumnVisibility: {
      triggersCount: false,
      reportsCount: false,
      createdByUser: false,
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
    navigate(`/data-marts/${id}/data-setup`);
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

  const tableId = 'data-marts-table';

  return (
    <div className='dm-card'>
      <BaseTable
        tableId={tableId}
        table={table}
        onRowClick={handleRowClick}
        ariaLabel='Data Marts table'
        renderToolbarLeft={table => (
          <>
            {/* BTNs for selected Rows */}
            {hasSelectedRows && (
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
            )}
            {hasSelectedRows && (
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
            )}
            {/* Search */}
            <TableColumnSearch
              table={table}
              columnId={DataMartColumnKey.TITLE}
              placeholder='Search by title'
            />
          </>
        )}
        renderToolbarRight={() => (
          <TableCTAButton asChild>
            <Link to={scope('/data-marts/create')}>
              <Plus className='h-4 w-4' />
              New Data Mart
            </Link>
          </TableCTAButton>
        )}
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
  );
}
