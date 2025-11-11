import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { SortableHeader, ToggleColumnsHeader } from '../../../../../shared/components/Table';

export interface InsightTableItem {
  id: string;
  title: string;
  lastUpdated: Date;
}

interface InsightColumnsProps {
  onDelete?: (id: string) => void;
}

export const getInsightColumns = ({
  onDelete,
}: InsightColumnsProps = {}): (ColumnDef<InsightTableItem> & {
  meta?: { hidden?: boolean; title?: string };
})[] => [
  {
    accessorKey: 'title',
    size: 50, // responsive width in %
    header: ({ column }) => <SortableHeader column={column}>Title</SortableHeader>,
    cell: ({ row }) => {
      const title = row.getValue<string>('title');
      return <div className='overflow-hidden text-ellipsis'>{title}</div>;
    },
    meta: { title: 'Title' },
  },
  {
    accessorKey: 'lastUpdated',
    size: 50, // responsive width in %
    sortDescFirst: true,
    header: ({ column }) => <SortableHeader column={column}>Last updated</SortableHeader>,
    cell: ({ row }) => {
      const date = row.getValue<Date>('lastUpdated');
      const formatted = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
      return <div className='text-muted-foreground'>{formatted}</div>;
    },
    meta: { title: 'Last updated' },
  },
  {
    id: 'actions',
    size: 80, // fixed width in pixels
    header: ({ table }) => <ToggleColumnsHeader table={table} />,
    cell: ({ row }) => (
      <div
        className='actions-cell text-right'
        onClick={e => {
          e.stopPropagation();
        }}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              className='dm-card-table-body-row-actionbtn opacity-0 transition-opacity group-hover:opacity-100'
              aria-label='Open menu'
            >
              <MoreHorizontal className='dm-card-table-body-row-actionbtn-icon' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem
              className='text-destructive'
              onClick={() => onDelete?.(row.original.id)}
            >
              <Trash2 className='mr-2 h-4 w-4 text-red-600' />
              <span className='text-red-600'>Delete insight</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ),
    meta: { title: 'Actions' },
  },
];
