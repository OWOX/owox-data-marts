import { type ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { type DataMart } from './types';
import { SortableHeader } from './SortableHeader';

// Define the columns configuration for the DataMartTable
export const columns: ColumnDef<DataMart>[] = [
  {
    accessorKey: 'title',
    header: ({ column }) => (
      <div className='group/header'>
        <SortableHeader column={column}>Title</SortableHeader>
      </div>
    ),
  },
  {
    accessorKey: 'owner',
    header: ({ column }) => (
      <div className='group/header'>
        <SortableHeader column={column}>Owner</SortableHeader>
      </div>
    ),
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => (
      <div className='group/header'>
        <SortableHeader column={column}>Created at</SortableHeader>
      </div>
    ),
    cell: ({ row }) => {
      const date = row.getValue<Date>('createdAt');
      const formatted = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(date);

      return <div>{formatted}</div>;
    },
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <div className='group/header'>
        <SortableHeader column={column}>Status</SortableHeader>
      </div>
    ),
    cell: ({ row }) => {
      const status = row.getValue<string>('status');
      return (
        <div
          className={`capitalize ${status === 'success' ? 'text-green-600 dark:text-green-700' : status === 'failed' ? 'text-red-600 dark:text-red-700' : ''}`}
        >
          {status}
        </div>
      );
    },
  },
  {
    id: 'actions',
    cell: () => (
      <div className='text-right'>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='ghost' className='h-8 w-8 p-0'>
              <span className='sr-only'>Open menu</span>
              <MoreHorizontal className='h-4 w-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem>Open</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className='text-red-600'>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ),
  },
];
