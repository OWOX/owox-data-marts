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
import { SortableHeader } from './SortableHeader';
import { DataStorageTypeModel } from '../../../shared/types/data-storage-type.model';
import { Badge } from '@owox/ui/components/badge';
import { DataStorageType } from '../../../shared';

export interface DataStorageTableItem {
  id: string;
  title: string;
  type: DataStorageType;
  createdAt: Date;
  modifiedAt: Date;
}

interface DataStorageColumnsProps {
  onViewDetails?: (id: string) => void;
  onEdit?: (id: string) => Promise<void>;
  onDelete?: (id: string) => void;
}

export const getDataStorageColumns = ({
  onViewDetails,
  onEdit,
  onDelete,
}: DataStorageColumnsProps = {}): ColumnDef<DataStorageTableItem>[] => [
  {
    accessorKey: 'title',
    header: ({ column }) => (
      <div className='group/header'>
        <SortableHeader column={column}>Title</SortableHeader>
      </div>
    ),
    cell: ({ row }) => {
      const title = row.getValue<string>('title');
      return <div className='overflow-hidden text-ellipsis'>{title}</div>;
    },
  },
  {
    accessorKey: 'type',
    header: ({ column }) => (
      <div className='group/header'>
        <SortableHeader column={column}>Type</SortableHeader>
      </div>
    ),
    cell: ({ row }) => {
      const type = row.getValue<DataStorageType>('type');
      const { displayName, icon: Icon } = DataStorageTypeModel.getInfo(type);

      return (
        <Badge variant={'secondary'} className='flex items-center gap-2'>
          <Icon />
          {displayName}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'createdAt',
    sortDescFirst: true,
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
      const id = row.original.id;

      return (
        <div className='actions-cell text-right'>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' className='h-8 w-8 p-0'>
                <span className='sr-only'>Open menu</span>
                <MoreHorizontal className='h-4 w-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onClick={() => onViewDetails?.(id)}>View details</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void onEdit?.(id)}>Edit</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDelete?.(id)} className='text-red-600'>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
  },
];
