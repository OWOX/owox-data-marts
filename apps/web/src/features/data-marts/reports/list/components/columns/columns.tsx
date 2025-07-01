import { type ColumnDef } from '@tanstack/react-table';
import { formatDate } from '../../utils';
import { GoogleSheetsActionsCell } from '../GoogleSheetsActionsCell';
import { StatusIcon } from '../StatusIcon';
import { SortableHeader } from '../SortableHeader';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report.ts';

export type Align = 'left' | 'right' | 'center';

export const getAlignClass = (align?: Align): string => {
  switch (align) {
    case 'right':
      return 'text-right';
    case 'center':
      return 'text-center';
    default:
      return 'text-left';
  }
};

export const getGoogleSheetsColumns = ({
  onDeleteSuccess,
  onEditReport,
}: {
  onDeleteSuccess?: () => void;
  onEditReport?: (reportId: string) => void;
} = {}): (ColumnDef<DataMartReport> & {
  meta?: { hidden?: boolean; title?: string };
})[] => [
  {
    accessorKey: 'title',
    header: ({ column }) => <SortableHeader column={column}>Report Title</SortableHeader>,
    cell: ({ row }) => row.original.title,
    enableColumnFilter: true,
    meta: { title: 'Report title' },
  },
  {
    accessorKey: 'lastRunDate',
    header: ({ column }) => <SortableHeader column={column}>Last Run Date</SortableHeader>,
    cell: ({ row }) => (row.original.lastRunDate ? formatDate(row.original.lastRunDate) : '-'),
    size: 70,
    meta: { title: 'Last Run Date' },
  },
  {
    accessorKey: 'lastRunStatus',
    header: ({ column }) => <SortableHeader column={column}>Last Run Status</SortableHeader>,
    cell: ({ row }) =>
      row.original.lastRunStatus ? (
        <StatusIcon status={row.original.lastRunStatus} error={row.original.lastRunError} />
      ) : (
        '-'
      ),
    size: 60,
    meta: { title: 'Last Run Status' },
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <GoogleSheetsActionsCell
        row={row}
        onDeleteSuccess={onDeleteSuccess}
        onEditReport={onEditReport}
      />
    ),
    size: 20,
    meta: { title: 'Actions' },
  },
];
