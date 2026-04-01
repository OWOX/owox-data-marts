import { type ColumnDef } from '@tanstack/react-table';
import RelativeTime from '@owox/ui/components/common/relative-time';
import { SortableHeader, ToggleColumnsHeader } from '../../../../../../../shared/components/Table';
import { StatusIcon } from '../../StatusIcon';
import { GoogleSheetsActionsCell } from '../GoogleSheetsActionsCell';
import type { DataMartReport } from '../../../../shared/model/types/data-mart-report';
import { ReportColumnKey } from './columnKeys';
import { ReportColumnLabels } from './columnLabels';
import { UserReference } from '../../../../../../../shared/components/UserReference';
import { UserAvatarGroup } from '../../../../../../../shared/components/UserAvatarGroup/UserAvatarGroup';

interface GoogleSheetsTableColumnsProps {
  onDeleteSuccess?: () => void;
  onEditReport?: (report: DataMartReport) => void;
}

export const getGoogleSheetsColumns = ({
  onDeleteSuccess,
  onEditReport,
}: GoogleSheetsTableColumnsProps = {}): ColumnDef<DataMartReport>[] => [
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
    id: ReportColumnKey.CREATED_BY,
    accessorFn: row => {
      const u = row.createdByUser;
      return u?.fullName ?? u?.email;
    },
    size: 200,
    meta: {
      title: ReportColumnLabels[ReportColumnKey.CREATED_BY],
    },
    header: ({ column }) => (
      <SortableHeader column={column}>
        {ReportColumnLabels[ReportColumnKey.CREATED_BY]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const user = row.original.createdByUser;
      if (!user) return <span className='text-muted-foreground'>-</span>;
      return <UserReference userProjection={user} />;
    },
  },
  {
    id: ReportColumnKey.OWNERS,
    accessorFn: row => (row.ownerUsers ?? []).map(u => u.fullName ?? u.email).join(', '),
    size: 200,
    meta: {
      title: ReportColumnLabels[ReportColumnKey.OWNERS],
    },
    header: ({ column }) => (
      <SortableHeader column={column}>{ReportColumnLabels[ReportColumnKey.OWNERS]}</SortableHeader>
    ),
    cell: ({ row }) => {
      const users = row.original.ownerUsers ?? [];
      if (users.length === 0)
        return <span className='text-muted-foreground text-sm'>Not assigned</span>;
      if (users.length === 1) return <UserReference userProjection={users[0]} />;
      return <UserAvatarGroup users={users} />;
    },
  },
  {
    id: 'actions',
    size: 140,
    enableResizing: false,
    header: ({ table }) => <ToggleColumnsHeader table={table} />,
    cell: ({ row }) => (
      <GoogleSheetsActionsCell
        row={row}
        onDeleteSuccess={onDeleteSuccess}
        onEditReport={onEditReport}
      />
    ),
  },
];
