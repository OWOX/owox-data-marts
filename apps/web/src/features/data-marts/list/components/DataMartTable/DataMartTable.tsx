import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useProjectRoute } from '../../../../../shared/hooks';
import { type ColumnDef, type Row } from '@tanstack/react-table';
import { Button } from '@owox/ui/components/button';
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
import { Check, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { EmptyDataMartsState } from './components/EmptyDataMartsState';
import { CardSkeleton } from '../../../../../shared/components/CardSkeleton';
import { useContentPopovers } from '../../../../../app/store/hooks/useContentPopovers';
import { storageService } from '../../../../../services/localstorage.service';
import { useDataMartHealthStatusPrefetch } from '../../model/hooks/useDataMartHealthStatusPrefetch';
import { useBaseTable } from '../../../../../shared/hooks';
import {
  BaseTable,
  TableCTAButton,
  TableColumnSearch,
} from '../../../../../shared/components/Table';
import { DataMartColumnKey } from './columns/columnKeys';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  deleteDataMart: (id: string) => Promise<void>;
  refetchDataMarts: () => Promise<void>;
  isLoading?: boolean;
}

export function DataMartTable<TData, TValue>({
  columns,
  data,
  deleteDataMart,
  refetchDataMarts,
  isLoading,
}: DataTableProps<TData, TValue>) {
  const { navigate, scope } = useProjectRoute();

  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const hasSelectedRows = Object.keys(table.getState().rowSelection).length > 0;

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
    concurrency: 5,
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
                variant='destructive'
                size='sm'
                className='dm-card-toolbar-btn-delete'
                onClick={() => {
                  setShowDeleteConfirmation(true);
                }}
                disabled={isDeleting}
              >
                <Trash2 className='h-4 w-4' />
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
            <Link to={scope('/data-marts/create')}>New Data Mart</Link>
          </TableCTAButton>
        )}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirmation} onOpenChange={setShowDeleteConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              You're about to delete {Object.keys(table.getState().rowSelection).length} selected
              data mart
              {Object.keys(table.getState().rowSelection).length !== 1 ? 's' : ''}. This action
              cannot be undone.
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
    </div>
  );
}
