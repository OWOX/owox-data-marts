'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';

// Data type for a report row
export interface Reports {
  id: string;
  destinationAccess: string;
  documentTitle: string;
  sheetTitle: string;
  lastRunDate: string;
  status: 'processing' | 'success' | 'failed';
  runs: number;
}

export const columns: ColumnDef<Reports>[] = [
  {
    accessorKey: 'destinationAccess',
    header: ({ column }) => {
      return (
        <Button
          variant='ghost'
          onClick={() => {
            column.toggleSorting(column.getIsSorted() === 'asc');
          }}
          className='px-2'
        >
          Destination Access
          <ArrowUpDown className='ml-2 h-4 w-4' />
        </Button>
      );
    },
    enableSorting: true,
  },
  {
    accessorKey: 'documentTitle',
    header: ({ column }) => {
      return (
        <Button
          variant='ghost'
          onClick={() => {
            column.toggleSorting(column.getIsSorted() === 'asc');
          }}
          className='px-2'
        >
          Document
          <ArrowUpDown className='ml-2 h-4 w-4' />
        </Button>
      );
    },
    enableSorting: true,
  },
  {
    accessorKey: 'sheetTitle',
    header: ({ column }) => {
      return (
        <Button
          variant='ghost'
          onClick={() => {
            column.toggleSorting(column.getIsSorted() === 'asc');
          }}
          className='px-2'
        >
          Sheet
          <ArrowUpDown className='ml-2 h-4 w-4' />
        </Button>
      );
    },
    enableSorting: true,
  },
  {
    accessorKey: 'lastRunDate',
    header: ({ column }) => {
      return (
        <Button
          variant='ghost'
          onClick={() => {
            column.toggleSorting(column.getIsSorted() === 'asc');
          }}
          className='px-2'
        >
          Last Run
          <ArrowUpDown className='ml-2 h-4 w-4' />
        </Button>
      );
    },
    enableSorting: true,
  },
  {
    accessorKey: 'runs',
    header: ({ column }) => {
      return (
        <Button
          variant='ghost'
          onClick={() => {
            column.toggleSorting(column.getIsSorted() === 'asc');
          }}
          className='px-2'
        >
          Total Runs
          <ArrowUpDown className='ml-2 h-4 w-4' />
        </Button>
      );
    },
    enableSorting: true,
  },
  {
    id: 'actions',
    header: '',
    cell: () => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' className='h-8 w-8 p-0'>
            <span className='sr-only'>Open menu</span>
            <MoreHorizontal className='h-4 w-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem
            onClick={() => {
              /* handle open */
            }}
          >
            Open
          </DropdownMenuItem>
          <div className='my-1 border-t' />
          <DropdownMenuItem
            onClick={() => {
              /* handle delete */
            }}
            className={cn('text-red-600')}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    enableSorting: false,
    enableHiding: false,
  },
];
