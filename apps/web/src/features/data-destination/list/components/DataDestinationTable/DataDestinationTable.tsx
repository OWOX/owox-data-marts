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
import { DataDestinationDetailsDialog } from '../DataDestinationDetailsDialog';
import { type DataDestinationTableItem } from './columns';

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
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { ChevronDown, Search } from 'lucide-react';

interface DataDestinationTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  onViewDetails?: (id: string) => void;
  onEdit?: (id: string) => Promise<void>;
  onDelete?: (id: string) => void;
}

export function DataDestinationTable<TData, TValue>({
  columns,
  data,
  onViewDetails,
}: DataDestinationTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: false }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [selectedDataDestination, setSelectedDataDestination] =
    useState<DataDestinationTableItem | null>(null);

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

  const handleViewDetails = (id: string) => {
    const foundItem = data.find(
      item => (item as { id: string }).id === id
    ) as DataDestinationTableItem;
    setSelectedDataDestination(foundItem);
    setIsDetailsDialogOpen(true);
    onViewDetails?.(id);
  };

  const handleRowClick = (id: string, e: React.MouseEvent) => {
    if (
      e.target instanceof HTMLElement &&
      (e.target.closest('[role="checkbox"]') ||
        e.target.closest('.actions-cell') ||
        e.target.closest('[role="menuitem"]'))
    ) {
      return;
    }

    handleViewDetails(id);
  };

  return (
    <div>
      {selectedDataDestination && (
        <DataDestinationDetailsDialog
          isOpen={isDetailsDialogOpen}
          onClose={() => {
            setIsDetailsDialogOpen(false);
          }}
          id={selectedDataDestination.id}
        />
      )}
      <div className='flex items-center pb-4'>
        <div className='relative w-sm'>
          <Search className='text-muted-foreground absolute top-2.5 left-2 h-4 w-4' />
          <Input
            placeholder='Search by title'
            value={table.getColumn('title')?.getFilterValue() as string}
            onChange={event => table.getColumn('title')?.setFilterValue(event.target.value)}
            className='pl-8'
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='outline' className='ml-auto font-normal'>
              Show columns <ChevronDown className='ml-2 h-4 w-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            {table
              .getAllColumns()
              .filter(column => column.getCanHide())
              .map(column => {
                return (
                  <DropdownMenuItem key={column.id} className='capitalize'>
                    <div className='flex items-center space-x-2'>
                      <input
                        type='checkbox'
                        checked={column.getIsVisible()}
                        onChange={e => {
                          column.toggleVisibility(e.target.checked);
                        }}
                        className='h-4 w-4'
                      />
                      <span>{column.id}</span>
                    </div>
                  </DropdownMenuItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className='w-full rounded-md border'>
        <Table>
          <TableHeader className='bg-muted'>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map(header => {
                  return (
                    <TableHead
                      key={header.id}
                      className='[&:has([role=checkbox])]:pl-5 [&>[role=checkbox]]:translate-y-[2px]'
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
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map(row => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className='hover:bg-muted/50 cursor-pointer'
                  onClick={e => {
                    const id = (row.original as { id: string }).id;
                    handleRowClick(id, e);
                  }}
                >
                  {row.getVisibleCells().map(cell => (
                    <TableCell
                      key={cell.id}
                      className={`[&:has([role=checkbox])]pr-0 px-5 whitespace-normal [&>[role=checkbox]]:translate-y-[2px] ${cell.column.id === 'actions' ? 'actions-cell' : ''}`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length + 1} className='h-24 text-center'>
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className='flex items-center justify-end space-x-2 py-4'>
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
    </div>
  );
}
