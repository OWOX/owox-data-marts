import { type ColumnDef } from '@tanstack/react-table';
import { SortableHeader } from '../../../../../../shared/components/Table';
import { RawBase64Icon } from '../../../../../../shared/icons';
import type { CustomConnectorListItemDto } from '../../../../../connector-builder/shared/api/types';
import { ConnectorActionsCell } from '../ConnectorActionsCell';

export enum ConnectorColumnKey {
  LOGO = 'logo',
  TITLE = 'title',
  STATUS = 'status',
  DESCRIPTION = 'description',
  ACTIONS = 'actions',
}

interface ConnectorColumnsProps {
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  canDelete: boolean;
}

export function getConnectorColumns({
  onOpen,
  onDelete,
  canDelete,
}: ConnectorColumnsProps): ColumnDef<CustomConnectorListItemDto>[] {
  return [
    {
      id: ConnectorColumnKey.LOGO,
      size: 48,
      enableResizing: false,
      enableSorting: false,
      meta: { title: 'Logo', showHeaderTitle: false },
      header: () => null,
      cell: ({ row }) => <RawBase64Icon base64={row.original.logo} size={24} />,
    },
    {
      accessorKey: ConnectorColumnKey.TITLE,
      size: 320,
      meta: { title: 'Title' },
      header: ({ column }) => <SortableHeader column={column}>Title</SortableHeader>,
      cell: ({ row }) => (
        <div className='flex flex-col'>
          <span className='font-medium'>{row.original.title || row.original.name}</span>
          <span className='text-muted-foreground text-xs'>{row.original.name}</span>
        </div>
      ),
    },
    {
      id: ConnectorColumnKey.STATUS,
      accessorFn: row => row.activeVersion ?? 0,
      size: 160,
      meta: { title: 'Status' },
      header: ({ column }) => <SortableHeader column={column}>Status</SortableHeader>,
      cell: ({ row }) => {
        const v = row.original.activeVersion;
        return v ? (
          <span className='text-foreground'>Published · v{v}</span>
        ) : (
          <span className='text-muted-foreground'>Draft</span>
        );
      },
    },
    {
      accessorKey: ConnectorColumnKey.DESCRIPTION,
      meta: { title: 'Description' },
      header: ({ column }) => <SortableHeader column={column}>Description</SortableHeader>,
      cell: ({ row }) => (
        <span className='text-muted-foreground'>
          {row.original.description === '' ? '—' : row.original.description}
        </span>
      ),
    },
    {
      id: ConnectorColumnKey.ACTIONS,
      size: 80,
      enableResizing: false,
      enableSorting: false,
      meta: { title: 'Actions', showHeaderTitle: false },
      header: () => null,
      cell: ({ row }) => (
        <ConnectorActionsCell
          id={row.original.id}
          onOpen={onOpen}
          onDelete={onDelete}
          canDelete={canDelete}
        />
      ),
    },
  ];
}
