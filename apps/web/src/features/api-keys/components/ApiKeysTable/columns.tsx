import { type ColumnDef } from '@tanstack/react-table';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { Copy, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { SortableHeader, ToggleColumnsHeader } from '../../../../shared/components/Table';
import type { ProjectMemberApiKey } from '../../types';
import toast from 'react-hot-toast';

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${String(diffDays)} days ago`;
  if (diffDays < 365) return `${String(Math.floor(diffDays / 30))} months ago`;
  return date.toLocaleDateString();
}

function isExpiringSoon(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays > 0 && diffDays <= 30;
}

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
      const expiring = isExpiringSoon(expiresAt);
      return (
        <span className={expiring ? 'font-medium text-amber-600' : ''}>
          {new Date(expiresAt).toLocaleDateString()}
        </span>
      );
    },
  },
  {
    accessorKey: 'createdAt',
    size: 130,
    meta: { title: 'Created' },
    header: ({ column }) => <SortableHeader column={column}>Created</SortableHeader>,
    cell: ({ row }) => (
      <span className='text-muted-foreground'>{formatRelativeDate(row.original.createdAt)}</span>
    ),
  },
  {
    accessorKey: 'lastAuthenticatedAt',
    size: 150,
    meta: { title: 'Last authenticated' },
    header: ({ column }) => <SortableHeader column={column}>Last authenticated</SortableHeader>,
    cell: ({ row }) => (
      <span className='text-muted-foreground'>
        {formatRelativeDate(row.original.lastAuthenticatedAt)}
      </span>
    ),
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
