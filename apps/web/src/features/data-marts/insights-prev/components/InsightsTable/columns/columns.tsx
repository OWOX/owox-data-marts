import type { ColumnDef } from '@tanstack/react-table';
import { InsightActionsCell } from '../InsightActionsCell';
import { SortableHeader, ToggleColumnsHeader } from '../../../../../../shared/components/Table';
import { formatDateShort } from '../../../../../../utils/date-formatters';
import { InsightColumnKey } from './columnKeys';
import { InsightColumnLabels } from './columnLabels';

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
}: InsightColumnsProps = {}): ColumnDef<InsightTableItem>[] => [
  {
    accessorKey: InsightColumnKey.TITLE,
    size: 320,
    meta: { title: InsightColumnLabels[InsightColumnKey.TITLE] },
    header: ({ column }) => (
      <SortableHeader column={column}>{InsightColumnLabels[InsightColumnKey.TITLE]}</SortableHeader>
    ),
    cell: ({ row }) => {
      const title = row.getValue<string>(InsightColumnKey.TITLE);
      return <div className='overflow-hidden text-ellipsis'>{title}</div>;
    },
  },
  {
    accessorKey: InsightColumnKey.LAST_RUN,
    size: 150,
    meta: { title: InsightColumnLabels[InsightColumnKey.LAST_RUN] },
    sortDescFirst: true,
    header: ({ column }) => (
      <SortableHeader column={column}>
        {InsightColumnLabels[InsightColumnKey.LAST_RUN]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const date = row.getValue<Date>(InsightColumnKey.LAST_RUN);
      return <div className='text-muted-foreground'>{formatDateShort(date)}</div>;
    },
  },
  {
    id: 'actions',
    size: 80,
    enableResizing: false,
    header: ({ table }) => <ToggleColumnsHeader table={table} />,
    cell: ({ row }) => <InsightActionsCell id={row.original.id} onDelete={onDelete} />,
  },
];
