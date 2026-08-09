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
import { ExpirationValue } from '../../../../shared/components/ExpirationValue/ExpirationValue';
import { LICENSE_KEY_EXPIRED_NOTICE, LICENSE_KEY_EXPIRING_SOON_NOTICE } from '../../utils';
import { UserReference } from '../../../../shared/components/UserReference';

interface LicenseKeysColumnsProps {
  onEdit?: (key: LicenseKey) => void;
  onRevoke?: (key: LicenseKey) => void;
}

const relativeTimeCellClassName =
  'text-muted-foreground block max-w-full whitespace-normal break-words';

export const getLicenseKeysColumns = ({
  onEdit,
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
            void navigator.clipboard
              .writeText(row.original.licenseKeyId)
              .then(() => toast.success('License key ID copied'))
              .catch(() => toast.error('Failed to copy license key ID'));
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
            void navigator.clipboard
              .writeText(row.original.origin)
              .then(() => toast.success('Public origin copied'))
              .catch(() => toast.error('Failed to copy public origin'));
          }}
        >
          <Copy className='size-3' />
        </Button>
      </div>
    ),
  },
  {
    id: 'expiresAt',
    accessorFn: row => {
      const time = new Date(row.expiresAt).getTime();
      return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
    },
    size: 200,
    meta: { title: 'Expires' },
    sortingFn: 'basic',
    header: ({ column }) => <SortableHeader column={column}>Expires</SortableHeader>,
    cell: ({ row }) => (
      <ExpirationValue
        expiresAt={row.original.expiresAt}
        expiredNotice={LICENSE_KEY_EXPIRED_NOTICE}
        expiringSoonNotice={LICENSE_KEY_EXPIRING_SOON_NOTICE}
        focusable
      />
    ),
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
    cell: ({ row }) =>
      onEdit && onRevoke ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='ghost' size='icon' className='size-7' aria-label='License key actions'>
              <MoreHorizontal className='size-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem
              onClick={() => {
                onEdit(row.original);
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
      ) : null,
  },
];
