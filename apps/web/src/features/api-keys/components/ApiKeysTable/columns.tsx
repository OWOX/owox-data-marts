import { type ColumnDef } from '@tanstack/react-table';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Copy, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import RelativeTime from '@owox/ui/components/common/relative-time';
import { formatDateOnly } from '../../../../utils';
import { SortableHeader, ToggleColumnsHeader } from '../../../../shared/components/Table';
import type { ProjectMemberApiKey } from '../../types';
import toast from 'react-hot-toast';
import {
  API_KEY_EXPIRING_SOON_CLASS_NAME,
  API_KEY_EXPIRING_SOON_NOTICE,
  isApiKeyExpiringSoon,
} from '../../utils';

interface ApiKeysColumnsProps {
  onEditName: (key: ProjectMemberApiKey) => void;
  onRevoke: (key: ProjectMemberApiKey) => void;
}

export const getApiKeysColumns = ({
  onEditName,
  onRevoke,
}: ApiKeysColumnsProps): ColumnDef<ProjectMemberApiKey>[] => [
  {
    accessorKey: 'name',
    size: 200,
    meta: { title: 'Name' },
    header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
    cell: ({ row }) => <span className='font-medium'>{row.original.name}</span>,
  },
  {
    accessorKey: 'apiKeyId',
    size: 260,
    meta: { title: 'API Key ID' },
    header: ({ column }) => <SortableHeader column={column}>API Key ID</SortableHeader>,
    cell: ({ row }) => (
      <div className='flex items-center gap-1.5'>
        <code className='text-muted-foreground text-xs'>{row.original.apiKeyId}</code>
        <Button
          variant='ghost'
          size='icon'
          className='size-6'
          aria-label='Copy API Key ID'
          onClick={e => {
            e.stopPropagation();
            void navigator.clipboard.writeText(row.original.apiKeyId);
            toast.success('API Key ID copied');
          }}
        >
          <Copy className='size-3' />
        </Button>
      </div>
    ),
  },
  {
    accessorKey: 'expiresAt',
    size: 140,
    meta: { title: 'Expires' },
    header: ({ column }) => <SortableHeader column={column}>Expires</SortableHeader>,
    cell: ({ row }) => {
      const { expiresAt } = row.original;
      if (!expiresAt) return <span className='text-muted-foreground'>Never</span>;
      const dateLabel = formatDateOnly(expiresAt, { timeZone: 'UTC' });
      if (!isApiKeyExpiringSoon(expiresAt)) return <span>{dateLabel}</span>;

      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={API_KEY_EXPIRING_SOON_CLASS_NAME}>{dateLabel}</span>
          </TooltipTrigger>
          <TooltipContent side='top' align='start'>
            {API_KEY_EXPIRING_SOON_NOTICE}
          </TooltipContent>
        </Tooltip>
      );
    },
  },
  {
    accessorKey: 'createdAt',
    size: 130,
    meta: { title: 'Created' },
    header: ({ column }) => <SortableHeader column={column}>Created</SortableHeader>,
    cell: ({ row }) => (
      <RelativeTime date={new Date(row.original.createdAt)} className='text-muted-foreground' />
    ),
  },
  {
    accessorKey: 'lastAuthenticatedAt',
    size: 150,
    meta: { title: 'Last authenticated' },
    header: ({ column }) => <SortableHeader column={column}>Last authenticated</SortableHeader>,
    cell: ({ row }) => {
      const { lastAuthenticatedAt } = row.original;
      if (!lastAuthenticatedAt) return <span className='text-muted-foreground'>Never</span>;
      return (
        <RelativeTime date={new Date(lastAuthenticatedAt)} className='text-muted-foreground' />
      );
    },
  },
  {
    id: 'actions',
    size: 60,
    enableResizing: false,
    header: ({ table }) => <ToggleColumnsHeader table={table} />,
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' size='icon' className='size-7'>
            <MoreHorizontal className='size-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem
            onClick={() => {
              onEditName(row.original);
            }}
          >
            <Pencil className='mr-2 size-4' />
            Edit name
          </DropdownMenuItem>
          <DropdownMenuItem
            className='text-red-600 focus:text-red-600'
            onClick={() => {
              onRevoke(row.original);
            }}
          >
            <Trash2 className='mr-2 size-4' />
            Revoke
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];
