import type { ColumnDef } from '@tanstack/react-table';
import { InsightActionsCell } from '../InsightsTable/InsightActionsCell';
import { SortableHeader, ToggleColumnsHeader } from '../../../../../shared/components/Table';

export interface InsightTableItem {
  id: string;
  title: string;
  lastRun: Date;
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
    accessorKey: 'lastRun',
    size: 50, // responsive width in %
    sortDescFirst: true,
    header: ({ column }) => <SortableHeader column={column}>Last run</SortableHeader>,
    cell: ({ row }) => {
      const date = row.getValue<Date>('lastRun');
      const formatted = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
      return <div className='text-muted-foreground'>{formatted}</div>;
    },
    meta: { title: 'Last run' },
  },
  {
    id: 'actions',
    size: 80,
    header: ({ table }) => <ToggleColumnsHeader table={table} />,
    cell: ({ row }) => <InsightActionsCell id={row.original.id} onDelete={onDelete} />,
    meta: { title: 'Actions' },
  },
];
