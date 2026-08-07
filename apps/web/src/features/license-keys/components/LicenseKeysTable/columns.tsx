import { type ColumnDef } from '@tanstack/react-table';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { Copy, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import RelativeTime from '@owox/ui/components/common/relative-time';
import { SortableHeader, ToggleColumnsHeader } from '../../../../shared/components/Table';
import toast from 'react-hot-toast';
import type { LicenseKey } from '../../types';
import { LicenseKeyExpirationValue } from '../LicenseKeyExpirationValue';
import { UserReference } from '../../../../shared/components/UserReference';

interface LicenseKeysColumnsProps {
  onEditName: (key: LicenseKey) => void;
  onRevoke: (key: LicenseKey) => void;
}

const relativeTimeCellClassName =
  'text-muted-foreground block max-w-full whitespace-normal break-words';

export const getLicenseKeysColumns = ({
  onEditName,
  onRevoke,
}: LicenseKeysColumnsProps): ColumnDef<LicenseKey>[] => [
  {
    accessorKey: 'name',
    size: 180,
    meta: { title: 'Name' },
    header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
    cell: ({ row }) => <span className='font-medium'>{row.original.name}</span>,
  },
  {
    accessorKey: 'licenseKeyId',
    size: 240,
    meta: { title: 'License key ID' },
    header: ({ column }) => <SortableHeader column={column}>License key ID</SortableHeader>,
    cell: ({ row }) => (
      <div className='flex items-center gap-1.5'>
        <code className='text-muted-foreground text-xs'>{row.original.licenseKeyId}</code>
        <Button
          variant='ghost'
          size='icon'
          className='size-6'
          aria-label='Copy license key ID'
          onClick={e => {
            e.stopPropagation();
            void navigator.clipboard.writeText(row.original.licenseKeyId);
            toast.success('License key ID copied');
          }}
        >
          <Copy className='size-3' />
        </Button>
      </div>
    ),
  },
  {
    accessorKey: 'origin',
    size: 240,
    meta: { title: 'Public origin' },
    header: ({ column }) => <SortableHeader column={column}>Public origin</SortableHeader>,
    cell: ({ row }) => (
      <div className='flex items-center gap-1.5'>
        <code className='text-muted-foreground text-xs'>{row.original.origin}</code>
        <Button
          variant='ghost'
          size='icon'
          className='size-6'
          aria-label='Copy public origin'
          onClick={e => {
            e.stopPropagation();
            void navigator.clipboard.writeText(row.original.origin);
            toast.success('Public origin copied');
          }}
        >
          <Copy className='size-3' />
        </Button>
      </div>
    ),
  },
  {
    id: 'expiresAt',
    accessorFn: row => new Date(row.expiresAt).getTime(),
    size: 150,
    meta: { title: 'Expires' },
    sortingFn: 'basic',
    header: ({ column }) => <SortableHeader column={column}>Expires</SortableHeader>,
    cell: ({ row }) => <LicenseKeyExpirationValue expiresAt={row.original.expiresAt} />,
  },
  {
    accessorKey: 'createdAt',
    size: 130,
    meta: { title: 'Created' },
    header: ({ column }) => <SortableHeader column={column}>Created</SortableHeader>,
    cell: ({ row }) => (
      <RelativeTime date={new Date(row.original.createdAt)} className={relativeTimeCellClassName} />
    ),
  },
  {
    accessorKey: 'lastUsedAt',
    size: 150,
    meta: { title: 'Last activity' },
    header: ({ column }) => <SortableHeader column={column}>Last activity</SortableHeader>,
    cell: ({ row }) => {
      const { lastUsedAt } = row.original;
      if (!lastUsedAt) return <span className='text-muted-foreground'>Never</span>;
      return <RelativeTime date={new Date(lastUsedAt)} className={relativeTimeCellClassName} />;
    },
  },
  {
    id: 'createdByUser',
    accessorFn: row => row.createdByUser?.fullName ?? row.createdByUser?.email ?? '',
    size: 200,
    meta: { title: 'Created by' },
    header: ({ column }) => <SortableHeader column={column}>Created by</SortableHeader>,
    cell: ({ row }) => {
      const creator = row.original.createdByUser;
      if (!creator) return <span className='text-muted-foreground'>—</span>;
      return <UserReference userProjection={creator} />;
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
