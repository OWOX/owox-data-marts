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
import { SortableHeader } from './SortableHeader.tsx';
import { Link } from 'react-router-dom';
import type { DataMartListItem } from '../../model/types';

// Define the column configuration for the DataMartTable
export const columns: ColumnDef<DataMartListItem>[] = [
  {
    accessorKey: 'title',
    header: ({ column }) => (
      <div className='group/header'>
        <SortableHeader column={column}>Title</SortableHeader>
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
    id: 'actions',
    cell: ({ row }) => {
      return (
        <div className='text-right'>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' className='h-8 w-8 p-0'>
                <span className='sr-only'>Open menu</span>
                <MoreHorizontal className='h-4 w-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem>
                <Link
                  to={`/data-marts/${row.original.id}/overview`}
                  className='flex w-full items-center'
                >
                  Open
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className='text-red-600'>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
  },
];
