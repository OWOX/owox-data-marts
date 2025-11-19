import { type ColumnDef } from '@tanstack/react-table';
import { EmailActionsCell } from '../EmailActionsCell.tsx';
import { StatusIcon } from '../../StatusIcon';
import { SortableHeader } from '../SortableHeader.tsx';
import type { DataMartReport } from '../../../../shared/model/types/data-mart-report';
import { ToggleColumnsHeader } from '../ToggleColumnsHeader.tsx';
import { ReportColumnKey } from './columnKeys.ts';
import { ReportColumnLabels } from './columnLabels.ts';
import RelativeTime from '@owox/ui/components/common/relative-time';

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

export const getEmailColumns = ({
  onDeleteSuccess,
  onEditReport,
}: {
  onDeleteSuccess?: () => void;
  onEditReport?: (report: DataMartReport) => void;
} = {}): (ColumnDef<DataMartReport> & {
  meta?: { hidden?: boolean; title?: string };
})[] => [
  {
    accessorKey: ReportColumnKey.TITLE,
    header: ({ column }) => (
      <SortableHeader column={column}>{ReportColumnLabels[ReportColumnKey.TITLE]}</SortableHeader>
    ),
    cell: ({ row }) => row.original.title,
    enableColumnFilter: true,
    size: 50, // responsive width in %
  },
  {
    accessorKey: ReportColumnKey.LAST_RUN_DATE,
    header: ({ column }) => <SortableHeader column={column}>Last Run Date</SortableHeader>,
    cell: ({ row }) => {
      const lastRunTimestamp = row.original.lastRunDate;
      return (
        <div className='text-muted-foreground text-sm'>
          {lastRunTimestamp ? <RelativeTime date={new Date(lastRunTimestamp)} /> : 'Never run'}
        </div>
      );
    },
    size: 25, // responsive width in %
  },
  {
    accessorKey: ReportColumnKey.LAST_RUN_STATUS,
    header: ({ column }) => <SortableHeader column={column}>Last Run Status</SortableHeader>,
    cell: ({ row }) =>
      row.original.lastRunStatus ? (
        <StatusIcon status={row.original.lastRunStatus} error={row.original.lastRunError} />
      ) : (
        <span className='text-muted-foreground text-sm'>&mdash;</span>
      ),
    size: 25, // responsive width in %
  },
  {
    id: 'actions',
    header: ({ table }) => <ToggleColumnsHeader table={table} />,
    cell: ({ row }) => (
      <EmailActionsCell row={row} onDeleteSuccess={onDeleteSuccess} onEditReport={onEditReport} />
    ),
    size: 80, // fixed width in pixels
  },
];
