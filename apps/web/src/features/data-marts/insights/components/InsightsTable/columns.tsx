import type { ColumnDef } from '@tanstack/react-table';
import { InsightActionsCell } from '../InsightsTable/InsightActionsCell';
import { SortableHeader, ToggleColumnsHeader } from '../../../../../shared/components/Table';
import { formatDateShort } from '../../../../../utils/date-formatters';

export interface InsightTableItem {
  id: string;
  title: string;
  lastRun: Date | null;
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
      return <div className='text-muted-foreground'>{formatDateShort(date)}</div>;
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
