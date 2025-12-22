import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useProjectRoute } from '../../../../../shared/hooks';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
  type ColumnFiltersState,
  getFilteredRowModel,
  type RowSelectionState,
} from '@tanstack/react-table';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@owox/ui/components/table';

import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
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
import { Check, Search, Trash2, Plus } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { EmptyDataMartsState } from './components/EmptyDataMartsState';
import { CardSkeleton } from '../../../../../shared/components/CardSkeleton';
import { useTableStorage } from '../../../../../hooks/useTableStorage';
import { useContentPopovers } from '../../../../../app/store/hooks/useContentPopovers';
import { storageService } from '../../../../../services/localstorage.service';
import { TablePagination } from '@owox/ui/components/common/table-pagination';

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

  const { sorting, setSorting, columnVisibility, setColumnVisibility, pageSize, setPageSize } =
    useTableStorage({
      columns,
      storageKeyPrefix: 'data-mart-list',
      defaultColumnVisibility: {
        triggersCount: false,
        reportsCount: false,
        createdByUser: false,
      },
    });

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pageIndex, setPageIndex] = useState(0);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const ONBOARDING_VIDEO_KEY = 'data-mart-empty-state-onboarding-video-shown';
  const { open } = useContentPopovers();

  useEffect(() => {
    if (!isLoading && data.length === 0) {
      const wasShown = storageService.get(ONBOARDING_VIDEO_KEY, 'boolean');

      if (!wasShown) {
        open('video-3-getting-started-with-data-marts');
        storageService.set(ONBOARDING_VIDEO_KEY, true);
      }
    }
  }, [isLoading, data.length, open]);

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
      setRowSelection({});
      await refetchDataMarts();
    } catch (error) {
      console.error('Error deleting data marts:', error);
      toast.error('Failed to delete some data marts. Please try again.');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirmation(false);
    }
  };

  const hasSelectedRows = Object.keys(rowSelection).length > 0;

  const table = useReactTable({
    data,
    columns: [
      {
        id: 'select',
        size: 40,
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
      ...columns,
    ],
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    initialState: {
      pagination: {
        pageSize,
      },
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination: {
        pageIndex,
        pageSize,
      },
    },
    onPaginationChange: updater => {
      if (typeof updater === 'function') {
        const currentPagination = { pageIndex, pageSize };
        const newPagination = updater(currentPagination);

        if (newPagination.pageSize !== pageSize) {
          setPageSize(newPagination.pageSize);
        }
        if (newPagination.pageIndex !== pageIndex) {
          setPageIndex(newPagination.pageIndex);
        }
      }
    },
    enableRowSelection: true,
  });

  if (isLoading) {
    return (
      <div>
        <CardSkeleton />
      </div>
    );
  }

  if (!data.length) {
    return <EmptyDataMartsState />;
  }

  return (
    <div className='dm-card'>
      {/* TOOLBAR */}
      <div className='dm-card-toolbar'>
        {/* LEFT Column */}
        <div className='dm-card-toolbar-left'>
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
          <div className='dm-card-toolbar-search'>
            <Search className='dm-card-toolbar-search-icon' />
            <Input
              placeholder='Search by title'
              value={table.getColumn('title')?.getFilterValue() as string}
              onChange={event => table.getColumn('title')?.setFilterValue(event.target.value)}
              className='dm-card-toolbar-search-input'
            />
          </div>
        </div>

        {/* RIGHT Column */}
        <div className='dm-card-toolbar-right'>
          <Link to={scope('/data-marts/create')}>
            <Button variant='outline' className='dm-card-toolbar-btn-primary'>
              <Plus className='h-4 w-4' />
              New Data Mart
            </Button>
          </Link>
        </div>
      </div>
      {/* end: TOOLBAR */}

      {/* DM CARD TABLE */}
      <div className='dm-card-table-wrap'>
        <Table className='dm-card-table' role='table' aria-label='Data Marts table'>
          <TableHeader className='dm-card-table-header'>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id} className='dm-card-table-header-row'>
                {headerGroup.headers.map(header => {
                  return (
                    <TableHead
                      key={header.id}
                      className='[&:has([role=checkbox])]:pl-6 [&>[role=checkbox]]:translate-y-[2px]'
                      style={
                        header.column.id === 'select'
                          ? { width: 40, minWidth: 40, maxWidth: 40 }
                          : header.column.id === 'actions'
                            ? { width: 80, minWidth: 80, maxWidth: 80 }
                            : { width: `${String(header.getSize())}%` }
                      }
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className='dm-card-table-body'>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map(row => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className='dm-card-table-body-row group'
                  onClick={e => {
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
                  }}
                >
                  {row.getVisibleCells().map(cell => (
                    <TableCell
                      key={cell.id}
                      className={`[&:has([role=checkbox])]pr-0 px-6 whitespace-normal [&>[role=checkbox]]:translate-y-[2px] ${cell.column.id === 'actions' ? 'actions-cell' : ''} ${cell.column.id === 'createdAt' ? 'whitespace-nowrap' : ''}`}
                      style={
                        cell.column.id === 'select'
                          ? { width: 40, minWidth: 40, maxWidth: 40 }
                          : cell.column.id === 'actions'
                            ? { width: 80, minWidth: 80, maxWidth: 80 }
                            : { width: `${String(cell.column.getSize())}%` }
                      }
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length + 1} className='dm-card-table-body-row-empty'>
                  Oops! Nothing matched your search
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {/* end: DM CARD TABLE */}

      {/* DM CARD PAGINATION */}
      <TablePagination table={table} />
      {/* end: DM CARD PAGINATION */}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirmation} onOpenChange={setShowDeleteConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              You're about to delete {Object.keys(rowSelection).length} selected data mart
              {Object.keys(rowSelection).length !== 1 ? 's' : ''}. This action cannot be undone.
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
