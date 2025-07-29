import { useState } from 'react';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  type SortingState,
  getSortedRowModel,
  type ColumnFiltersState,
  getFilteredRowModel,
  type VisibilityState,
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
import { Plus, Search } from 'lucide-react';
import { EmptyDataDestinationsState } from './EmptyDataDestinationsState';

interface DataDestinationTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  onViewDetails?: (id: string) => void;
  onEdit?: (id: string) => Promise<void>;
  onDelete?: (id: string) => void;
  onOpenTypeDialog?: () => void;
}

export function DataDestinationTable<TData, TValue>({
  columns,
  data,
  onEdit,
  onOpenTypeDialog,
}: DataDestinationTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: false }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const table = useReactTable({
    data,
    columns: [...columns],
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
    enableRowSelection: true,
  });

  const handleRowClick = (id: string, e: React.MouseEvent) => {
    if (
      e.target instanceof HTMLElement &&
      (e.target.closest('[role="checkbox"]') ||
        e.target.closest('.actions-cell') ||
        e.target.closest('[role="menuitem"]'))
    ) {
      return;
    }

    void onEdit?.(id);
  };

  if (!data.length) {
    return (
      <div className='dm-card'>
        <EmptyDataDestinationsState onOpenTypeDialog={onOpenTypeDialog} />
      </div>
    );
  }

  return (
    <div>
      <div className='dm-card'>
        {/* TOOLBAR */}
        <div className='dm-card-toolbar'>
          {/* LEFT Column */}
          <div className='dm-card-toolbar-left'>
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
            <Button
              variant='outline'
              className='dm-card-toolbar-btn-primary'
              onClick={() => {
                onOpenTypeDialog?.();
              }}
            >
              <Plus className='h-4 w-4' />
              New Destination
            </Button>
          </div>
        </div>
        {/* end: TOOLBAR */}

        {/* DM CARD TABLE */}
        <div className='dm-card-table-wrap'>
          <Table className='dm-card-table' role='table' aria-label='Destinations table'>
            <TableHeader className='dm-card-table-header'>
              {table.getHeaderGroups().map(headerGroup => (
                <TableRow key={headerGroup.id} className='dm-card-table-header-row'>
                  {headerGroup.headers.map(header => {
                    return (
                      <TableHead
                        key={header.id}
                        className='[&:has([role=checkbox])]:pl-6 [&>[role=checkbox]]:translate-y-[2px]'
                        style={
                          header.column.id === 'actions'
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
                      const id = (row.original as { id: string }).id;
                      handleRowClick(id, e);
                    }}
                  >
                    {row.getVisibleCells().map(cell => (
                      <TableCell
                        key={cell.id}
                        className={`[&:has([role=checkbox])]pr-0 px-6 whitespace-normal [&>[role=checkbox]]:translate-y-[2px] ${cell.column.id === 'actions' ? 'actions-cell' : ''} ${cell.column.id === 'createdAt' ? 'whitespace-nowrap' : ''}`}
                        style={
                          cell.column.id === 'actions'
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
                    No results
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {/* end: DM CARD TABLE */}

        {/* DM CARD PAGINATION */}
        <div className='dm-card-pagination'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => {
              table.previousPage();
            }}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => {
              table.nextPage();
            }}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
        {/* end: DM CARD PAGINATION */}
      </div>
    </div>
  );
}
