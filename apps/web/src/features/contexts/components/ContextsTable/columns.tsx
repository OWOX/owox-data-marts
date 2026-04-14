import { type ColumnDef } from '@tanstack/react-table';
import { SortableHeader, ToggleColumnsHeader } from '../../../../shared/components/Table';
import { UserReference } from '../../../../shared/components/UserReference';
import { UserAvatarGroup } from '../../../../shared/components/UserAvatarGroup/UserAvatarGroup';
import type { UserProjection } from '../../../../shared/types';
import type { ContextDto } from '../../types/context.types';
import { ContextsActionsCell } from './ContextsActionsCell';

export interface ContextsTableItem extends ContextDto {
  memberCount: number;
  memberUsers: UserProjection[];
}

export enum ContextsColumnKey {
  NAME = 'name',
  DESCRIPTION = 'description',
  MEMBERS = 'memberCount',
  CREATED_BY = 'createdByUser',
  CREATED_AT = 'createdAt',
}

export const contextsColumnLabels: Record<ContextsColumnKey, string> = {
  [ContextsColumnKey.NAME]: 'Name',
  [ContextsColumnKey.DESCRIPTION]: 'Description',
  [ContextsColumnKey.MEMBERS]: 'Members',
  [ContextsColumnKey.CREATED_BY]: 'Created by',
  [ContextsColumnKey.CREATED_AT]: 'Created at',
};

interface ContextsColumnsProps {
  onEdit?: (contextId: string) => void;
  onDelete?: (contextId: string) => void;
  isAdmin?: boolean;
}

export const getContextsColumns = ({
  onEdit,
  onDelete,
  isAdmin = false,
}: ContextsColumnsProps = {}): ColumnDef<ContextsTableItem>[] => [
  {
    accessorKey: ContextsColumnKey.NAME,
    size: 240,
    meta: { title: contextsColumnLabels[ContextsColumnKey.NAME] },
    header: ({ column }) => (
      <SortableHeader column={column}>
        {contextsColumnLabels[ContextsColumnKey.NAME]}
      </SortableHeader>
    ),
    cell: ({ row }) => <div className='font-medium'>{row.original.name}</div>,
  },
  {
    accessorKey: ContextsColumnKey.DESCRIPTION,
    size: 360,
    enableSorting: false,
    meta: { title: contextsColumnLabels[ContextsColumnKey.DESCRIPTION] },
    header: contextsColumnLabels[ContextsColumnKey.DESCRIPTION],
    cell: ({ row }) => {
      const desc = row.original.description;
      if (!desc) return <span className='text-muted-foreground'>—</span>;
      return <div className='text-muted-foreground truncate'>{desc}</div>;
    },
  },
  {
    accessorKey: ContextsColumnKey.MEMBERS,
    size: 160,
    sortingFn: (a, b) => a.original.memberCount - b.original.memberCount,
    meta: { title: contextsColumnLabels[ContextsColumnKey.MEMBERS] },
    header: ({ column }) => (
      <SortableHeader column={column}>
        {contextsColumnLabels[ContextsColumnKey.MEMBERS]}
      </SortableHeader>
    ),
    cell: ({ row }) => <UserAvatarGroup users={row.original.memberUsers} />,
  },
  {
    id: ContextsColumnKey.CREATED_BY,
    accessorFn: row => row.createdByUser?.fullName ?? row.createdByUser?.email ?? '',
    size: 200,
    meta: { title: contextsColumnLabels[ContextsColumnKey.CREATED_BY] },
    header: ({ column }) => (
      <SortableHeader column={column}>
        {contextsColumnLabels[ContextsColumnKey.CREATED_BY]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const u = row.original.createdByUser;
      if (!u) return <span className='text-muted-foreground'>—</span>;
      return (
        <UserReference
          userProjection={{
            userId: u.userId,
            fullName: u.fullName ?? null,
            email: u.email,
            avatar: u.avatar ?? null,
          }}
        />
      );
    },
  },
  {
    accessorKey: ContextsColumnKey.CREATED_AT,
    size: 140,
    sortDescFirst: true,
    meta: { title: contextsColumnLabels[ContextsColumnKey.CREATED_AT] },
    header: ({ column }) => (
      <SortableHeader column={column}>
        {contextsColumnLabels[ContextsColumnKey.CREATED_AT]}
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const date = new Date(row.original.createdAt);
      const formatted = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(date);
      return <div className='text-muted-foreground'>{formatted}</div>;
    },
  },
  {
    id: 'actions',
    size: 80,
    enableResizing: false,
    header: ({ table }) => <ToggleColumnsHeader table={table} />,
    cell: ({ row }) => (
      <ContextsActionsCell
        contextId={row.original.id}
        isAdmin={isAdmin}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    ),
  },
];
