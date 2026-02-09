import { type ColumnDef } from '@tanstack/react-table';
import { SortableHeader, ToggleColumnsHeader } from '../../../../../../../shared/components/Table';
import RelativeTime from '@owox/ui/components/common/relative-time';
import { EmailActionsCell } from '../EmailActionsCell';
import { StatusIcon } from '../../StatusIcon';
import type { DataMartReport } from '../../../../shared/model/types/data-mart-report';
import { ReportColumnKey } from './columnKeys';
import { ReportColumnLabels } from './columnLabels';

interface EmailTableColumnsProps {
  onDeleteSuccess?: () => void;
  onEditReport?: (report: DataMartReport) => void;
}

export const getEmailColumns = ({
  onDeleteSuccess,
  onEditReport,
}: EmailTableColumnsProps = {}): ColumnDef<DataMartReport>[] => [
  {
    accessorKey: ReportColumnKey.TITLE,
    size: 320,
    enableColumnFilter: true,
    meta: {
      title: ReportColumnLabels[ReportColumnKey.TITLE],
    },
    header: ({ column }) => (
      <SortableHeader column={column}>{ReportColumnLabels[ReportColumnKey.TITLE]}</SortableHeader>
    ),
    cell: ({ row }) => row.original.title,
  },
  {
    accessorKey: ReportColumnKey.LAST_RUN_DATE,
    size: 250,
    meta: {
      title: ReportColumnLabels[ReportColumnKey.LAST_RUN_DATE],
    },
    header: ({ column }) => (
      <SortableHeader column={column}>
        {ReportColumnLabels[ReportColumnKey.LAST_RUN_DATE]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const lastRunTimestamp = row.original.lastRunDate;
      return (
        <div className='text-muted-foreground text-sm'>
          {lastRunTimestamp ? <RelativeTime date={new Date(lastRunTimestamp)} /> : 'Never run'}
        </div>
      );
    },
  },
  {
    accessorKey: ReportColumnKey.LAST_RUN_STATUS,
    size: 200,
    meta: {
      title: ReportColumnLabels[ReportColumnKey.LAST_RUN_STATUS],
    },
    header: ({ column }) => (
      <SortableHeader column={column}>
        {ReportColumnLabels[ReportColumnKey.LAST_RUN_STATUS]}
      </SortableHeader>
    ),
    cell: ({ row }) =>
      row.original.lastRunStatus ? (
        <StatusIcon status={row.original.lastRunStatus} error={row.original.lastRunError} />
      ) : (
        <span className='text-muted-foreground text-sm'>&mdash;</span>
      ),
  },
  {
    id: 'actions',
    size: 140,
    enableResizing: false,
    header: ({ table }) => <ToggleColumnsHeader table={table} />,
    cell: ({ row }) => (
      <EmailActionsCell row={row} onDeleteSuccess={onDeleteSuccess} onEditReport={onEditReport} />
    ),
  },
];
