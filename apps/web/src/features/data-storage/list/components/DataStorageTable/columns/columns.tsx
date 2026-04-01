import { type ColumnDef } from '@tanstack/react-table';
import { SortableHeader, ToggleColumnsHeader } from '../../../../../../shared/components/Table';
import { DataStorageHealthIndicator, DataStorageType } from '../../../../shared';
import { DataStorageTypeModel } from '../../../../shared/types/data-storage-type.model';
import { DataStorageActionsCell } from '../DataStorageActionsCell';
import { DataStorageColumnKey } from './columnKeys';
import { dataStorageColumnLabels } from './columnLabels';
import { type UserProjection } from '../../../../../../shared/types';
import { UserReference } from '../../../../../../shared/components/UserReference';
import { UserAvatarGroup } from '../../../../../../shared/components/UserAvatarGroup/UserAvatarGroup';

export interface DataStorageTableItem {
  id: string;
  title: string;
  type: DataStorageType;
  createdAt: Date;
  modifiedAt: Date;
  publishedDataMartsCount: number;
  draftDataMartsCount: number;
  createdByUser?: UserProjection | null;
  ownerUsers?: UserProjection[];
}

interface DataStorageColumnsProps {
  onViewDetails?: (id: string) => void;
  onEdit?: (id: string) => Promise<void>;
  onDelete?: (id: string) => void;
  onPublishDrafts?: (id: string) => Promise<void>;
}

export const getDataStorageColumns = ({
  onViewDetails,
  onEdit,
  onDelete,
  onPublishDrafts,
}: DataStorageColumnsProps = {}): ColumnDef<DataStorageTableItem>[] => [
  {
    id: DataStorageColumnKey.HEALTH,
    size: 40,
    enableResizing: false,
    meta: {
      title: dataStorageColumnLabels[DataStorageColumnKey.HEALTH],
      showHeaderTitle: false,
    },
    enableSorting: false,
    header: () => null,
    cell: ({ row }) => (
      <DataStorageHealthIndicator
        storageId={row.original.id}
        storageTitle={row.original.title}
        hovercardSide='right'
        variant='compact'
      />
    ),
  },
  {
    accessorKey: DataStorageColumnKey.TITLE,
    size: 320,
    meta: {
      title: dataStorageColumnLabels[DataStorageColumnKey.TITLE],
    },
    header: ({ column }) => (
      <SortableHeader column={column}>
        {dataStorageColumnLabels[DataStorageColumnKey.TITLE]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const title = row.getValue<string>(DataStorageColumnKey.TITLE);
      return <div>{title}</div>;
    },
  },
  {
    accessorKey: DataStorageColumnKey.TYPE,
    size: 240,
    meta: {
      title: dataStorageColumnLabels[DataStorageColumnKey.TYPE],
    },
    header: ({ column }) => (
      <SortableHeader column={column}>
        {dataStorageColumnLabels[DataStorageColumnKey.TYPE]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const type = row.getValue<DataStorageType>(DataStorageColumnKey.TYPE);
      const { displayName, icon: Icon } = DataStorageTypeModel.getInfo(type);

      return (
        <div className='text-muted-foreground flex items-center gap-2'>
          <Icon size={18} />
          {displayName}
        </div>
      );
    },
  },
  {
    accessorKey: DataStorageColumnKey.CREATED_AT,
    size: 140,
    sortDescFirst: true,
    meta: {
      title: dataStorageColumnLabels[DataStorageColumnKey.CREATED_AT],
    },
    header: ({ column }) => (
      <SortableHeader column={column}>
        {dataStorageColumnLabels[DataStorageColumnKey.CREATED_AT]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const date = row.getValue<Date>(DataStorageColumnKey.CREATED_AT);
      const formatted = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(date);

      return <div className='text-muted-foreground'>{formatted}</div>;
    },
  },
  {
    id: DataStorageColumnKey.CREATED_BY,
    accessorFn: row => {
      const u = row.createdByUser;
      return u?.fullName ?? u?.email;
    },
    size: 200,
    meta: {
      title: dataStorageColumnLabels[DataStorageColumnKey.CREATED_BY],
    },
    header: ({ column }) => (
      <SortableHeader column={column}>
        {dataStorageColumnLabels[DataStorageColumnKey.CREATED_BY]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const user = row.original.createdByUser;
      if (!user) return <span className='text-muted-foreground'>-</span>;
      return <UserReference userProjection={user} />;
    },
  },
  {
    id: DataStorageColumnKey.OWNERS,
    accessorFn: row => (row.ownerUsers ?? []).map(u => u.fullName ?? u.email).join(', '),
    size: 200,
    meta: {
      title: dataStorageColumnLabels[DataStorageColumnKey.OWNERS],
    },
    header: ({ column }) => (
      <SortableHeader column={column}>
        {dataStorageColumnLabels[DataStorageColumnKey.OWNERS]}
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
    accessorKey: DataStorageColumnKey.DATA_MARTS_COUNT,
    size: 120,
    meta: {
      title: dataStorageColumnLabels[DataStorageColumnKey.DATA_MARTS_COUNT],
    },
    header: ({ column }) => (
      <SortableHeader column={column}>
        {dataStorageColumnLabels[DataStorageColumnKey.DATA_MARTS_COUNT]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const count = row.getValue<string>(DataStorageColumnKey.DATA_MARTS_COUNT);
      return <div>{count}</div>;
    },
  },
  {
    accessorKey: DataStorageColumnKey.DRAFTS_COUNT,
    size: 120,
    meta: {
      title: dataStorageColumnLabels[DataStorageColumnKey.DRAFTS_COUNT],
    },
    header: ({ column }) => (
      <SortableHeader column={column}>
        {dataStorageColumnLabels[DataStorageColumnKey.DRAFTS_COUNT]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const count = row.getValue<string>(DataStorageColumnKey.DRAFTS_COUNT);
      return <div>{count}</div>;
    },
  },
  {
    id: 'actions',
    size: 80,
    enableResizing: false,
    header: ({ table }) => <ToggleColumnsHeader table={table} />,
    cell: ({ row }) => (
      <DataStorageActionsCell
        id={row.original.id}
        type={row.original.type}
        draftDataMartsCount={row.original.draftDataMartsCount}
        onViewDetails={onViewDetails}
        onEdit={onEdit}
        onDelete={onDelete}
        onPublishDrafts={onPublishDrafts}
      />
    ),
  },
];
