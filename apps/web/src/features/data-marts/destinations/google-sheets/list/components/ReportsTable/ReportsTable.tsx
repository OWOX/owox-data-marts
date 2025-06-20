'use client';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  getFilteredRowModel,
} from '@tanstack/react-table';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@owox/ui/components/table';

import type { ColumnDef } from '@tanstack/react-table';
import { Input } from '@owox/ui/components/input';
import { Search } from 'lucide-react';
import { useState } from 'react';
import type { SortingState, ColumnFiltersState } from '@tanstack/react-table';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { Button } from '@owox/ui/components/button';
import { Check, Plus, Settings2 } from 'lucide-react';

interface ReportsTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
}

export function ReportsTable<TData, TValue>({ columns, data }: ReportsTableProps<TData, TValue>) {
  // State for sorting and filtering
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className='w-full'>
      {/* Filter input and column visibility + Add report button */}
      <div className='flex items-center justify-between pb-4'>
        <div className='flex items-center gap-2'>
          <div className='relative w-sm'>
            <Search className='text-muted-foreground absolute top-2.5 left-2 h-4 w-4' />
            <Input
              placeholder='Search by sheet title'
              value={(() => {
                const col = table.getColumn('sheetTitle');
                if (!col) return '';
                const val = col.getFilterValue();
                return typeof val === 'string' ? val : '';
              })()}
              onChange={event => {
                const col = table.getColumn('sheetTitle');
                if (col) {
                  col.setFilterValue(event.target.value);
                }
              }}
              className='border-muted rounded-md border bg-white pl-8 dark:bg-white/4'
            />
          </div>
          {/* Column visibility dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant='outline'
                className='ml-2 h-8 px-2 font-normal'
                aria-label='Show columns'
              >
                <Settings2 className='h-4 w-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='start'>
              <DropdownMenuItem disabled className='cursor-default opacity-70 select-none'>
                Toggle columns
              </DropdownMenuItem>
              {table
                .getAllColumns()
                .filter(column => column.getCanHide())
                .map(column => (
                  <DropdownMenuItem
                    key={column.id}
                    className='flex items-center gap-2 capitalize'
                    onClick={() => {
                      column.toggleVisibility(!column.getIsVisible());
                    }}
                  >
                    <span
                      className={`mr-2 flex h-4 w-4 items-center justify-center rounded border ${column.getIsVisible() ? 'bg-brand-blue-500 border-brand-blue-500' : ''}`}
                    >
                      {column.getIsVisible() && <Check className='h-3 w-3 text-white' />}
                    </span>
                    {column.id}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Button variant='outline' className='flex h-8 items-center gap-2 px-3'>
          <Plus className='h-4 w-4' />
          Add report
        </Button>
      </div>
      <div className='rounded-md border-b border-gray-200 bg-white transition-shadow duration-200 hover:shadow-sm dark:border-0 dark:bg-white/4'>
        <Table>
          <TableHeader className='rounded-tl-md rounded-tr-md border-0 border-b bg-transparent dark:bg-transparent'>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow
                key={headerGroup.id}
                className='bg-muted/50 border-b hover:bg-white dark:bg-white/2 dark:hover:bg-white/10'
              >
                {headerGroup.headers.map(header => {
                  return (
                    <TableHead key={header.id} className=''>
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
                <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                  {row.getVisibleCells().map((cell, idx, arr) => (
                    <TableCell key={cell.id} className={idx === arr.length - 1 ? '' : 'pl-5'}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className='h-24 text-center'>
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
