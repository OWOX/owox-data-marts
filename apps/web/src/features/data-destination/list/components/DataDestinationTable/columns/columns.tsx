import { type ColumnDef } from '@tanstack/react-table';
import { type DataDestination, DataDestinationTypeModel } from '../../../../shared';
import { DataDestinationType } from '../../../../shared';
import { DataDestinationActionsCell } from '../DataDestinationActionsCell';
import { SortableHeader, ToggleColumnsHeader } from '../../../../../../shared/components/Table';
import { DataDestinationColumnKey } from './columnKeys';
import { dataDestinationColumnLabels } from './columnLabels';
import { type UserProjection } from '../../../../../../shared/types';
import { UserReference } from '../../../../../../shared/components/UserReference';
import { UserAvatarGroup } from '../../../../../../shared/components/UserAvatarGroup/UserAvatarGroup';

export interface DataDestinationTableItem {
  id: string;
  title: string;
  type: DataDestinationType;
  createdAt: Date;
  modifiedAt: Date;
  credentials?: DataDestination['credentials'];
  createdByUser?: UserProjection | null;
  ownerUsers?: UserProjection[];
}

interface DataDestinationColumnsProps {
  onEdit?: (id: string) => Promise<void>;
  onDelete?: (id: string) => void;
  onRotateSecretKey?: (id: string) => void;
}

export const getDataDestinationColumns = ({
  onEdit,
  onDelete,
  onRotateSecretKey,
}: DataDestinationColumnsProps = {}): ColumnDef<DataDestinationTableItem>[] => [
  {
    accessorKey: DataDestinationColumnKey.TITLE,
    meta: {
      title: dataDestinationColumnLabels[DataDestinationColumnKey.TITLE],
    },
    size: 320,
    header: ({ column }) => (
      <SortableHeader column={column}>
        {dataDestinationColumnLabels[DataDestinationColumnKey.TITLE]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const title = row.getValue<string>(DataDestinationColumnKey.TITLE);
      return <div className='overflow-hidden text-ellipsis'>{title}</div>;
    },
  },
  {
    accessorKey: DataDestinationColumnKey.TYPE,
    meta: {
      title: dataDestinationColumnLabels[DataDestinationColumnKey.TYPE],
    },
    size: 150,
    header: ({ column }) => (
      <SortableHeader column={column}>
        {dataDestinationColumnLabels[DataDestinationColumnKey.TYPE]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const type = row.getValue<DataDestinationType>(DataDestinationColumnKey.TYPE);
      const { displayName, icon: Icon } = DataDestinationTypeModel.getInfo(type);

      return (
        <div className='text-muted-foreground flex items-center gap-2'>
          <Icon size={18} />
          {displayName}
        </div>
      );
    },
  },
  {
    accessorKey: DataDestinationColumnKey.CREATED_AT,
    meta: {
      title: dataDestinationColumnLabels[DataDestinationColumnKey.CREATED_AT],
    },
    size: 140,
    sortDescFirst: true,
    header: ({ column }) => (
      <SortableHeader column={column}>
        {dataDestinationColumnLabels[DataDestinationColumnKey.CREATED_AT]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const date = row.getValue<Date>(DataDestinationColumnKey.CREATED_AT);
      const formatted = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(date);

      return <div className='text-muted-foreground'>{formatted}</div>;
    },
  },
  {
    id: DataDestinationColumnKey.CREATED_BY,
    accessorFn: row => {
      const u = row.createdByUser;
      return u?.fullName ?? u?.email;
    },
    meta: {
      title: dataDestinationColumnLabels[DataDestinationColumnKey.CREATED_BY],
    },
    size: 200,
    header: ({ column }) => (
      <SortableHeader column={column}>
        {dataDestinationColumnLabels[DataDestinationColumnKey.CREATED_BY]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const user = row.original.createdByUser;
      if (!user) return <span className='text-muted-foreground'>-</span>;
      return <UserReference userProjection={user} />;
    },
  },
  {
    id: DataDestinationColumnKey.OWNERS,
    accessorFn: row => (row.ownerUsers ?? []).map(u => u.fullName ?? u.email).join(', '),
    meta: {
      title: dataDestinationColumnLabels[DataDestinationColumnKey.OWNERS],
    },
    size: 200,
    header: ({ column }) => (
      <SortableHeader column={column}>
        {dataDestinationColumnLabels[DataDestinationColumnKey.OWNERS]}
      </SortableHeader>
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
    size: 80,
    enableResizing: false,
    header: ({ table }) => <ToggleColumnsHeader table={table} />,
    cell: ({ row }) => (
      <DataDestinationActionsCell
        id={row.original.id}
        type={row.original.type}
        credentials={row.original.credentials}
        onEdit={onEdit}
        onDelete={onDelete}
        onRotateSecretKey={onRotateSecretKey}
      />
    ),
  },
];
