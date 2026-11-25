import { Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Skeleton } from '@owox/ui/components/skeleton';
import { cn } from '@owox/ui/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@owox/ui/components/table';
import { ConfirmationDialog } from '../../../../../shared/components/ConfirmationDialog';
import { formatDateOnly } from '../../../../../utils/date-formatters';
import { formatBytes } from '../../../../../utils/format-bytes';
import { useOwoxStorageUsage } from '../../hooks/useOwoxStorageUsage';

export function OwoxStorageUsage({ storageId }: { storageId: string }) {
  const {
    usage,
    failed,
    loading,
    load,
    tableToDelete,
    setTableToDelete,
    deleting,
    confirmDelete,
    restoring,
    restore,
  } = useOwoxStorageUsage(storageId);

  if (failed) {
    return (
      <div role='alert' className='text-destructive flex items-center gap-3 text-sm'>
        <span>Storage usage could not be loaded.</span>
        <Button type='button' variant='outline' size='sm' onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  if (!usage) {
    return (
      <Skeleton className='text-muted-foreground flex h-24 w-full items-center justify-center gap-2 text-sm'>
        <Loader2 className='size-4 animate-spin' aria-hidden='true' />
        Loading storage metadata…
      </Skeleton>
    );
  }

  if (usage.deletedAt) {
    return (
      <div className='bg-warning-bg text-warning space-y-2 rounded-md px-3 py-2 text-sm'>
        <p>
          This storage and its data were deleted on {formatDateOnly(usage.deletedAt)}. Restore it to
          use it again. The Data Marts that use it keep their settings, and their next connector
          runs load their data again.
        </p>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={restoring}
          onClick={() => void restore()}
        >
          {restoring && <Loader2 className='animate-spin' />}
          Restore storage
        </Button>
      </div>
    );
  }

  const full = usage.usedBytes >= usage.limitBytes;

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between gap-3'>
        <p className='text-sm'>
          {formatBytes(usage.usedBytes)} of {formatBytes(usage.limitBytes)} used
        </p>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={loading}
          onClick={() => void load(true)}
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden='true' />
          <span>Refresh</span>
        </Button>
      </div>
      {full && (
        <p className='bg-warning-bg text-warning rounded-md px-3 py-2 text-sm'>
          This storage is full. New connector runs are refused until you delete tables. To get more
          space, contact OWOX support.
        </p>
      )}
      {usage.tables.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          No tables yet. Connector Data Marts create tables here when they load data.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Table</TableHead>
              <TableHead className='text-right'>Rows</TableHead>
              <TableHead className='text-right'>Size</TableHead>
              <TableHead className='w-10' />
            </TableRow>
          </TableHeader>
          <TableBody>
            {usage.tables.map(table => (
              <TableRow key={table.name}>
                <TableCell>{table.name}</TableCell>
                <TableCell className='text-right'>
                  {table.rowCount.toLocaleString('en-US')}
                </TableCell>
                <TableCell className='text-right'>{formatBytes(table.sizeBytes)}</TableCell>
                <TableCell>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-sm'
                    aria-label={`Delete table ${table.name}`}
                    onClick={() => {
                      setTableToDelete(table.name);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <ConfirmationDialog
        open={tableToDelete !== null}
        onOpenChange={open => {
          if (!open && !deleting) setTableToDelete(null);
        }}
        title='Delete table'
        description={`"${tableToDelete ?? ''}" and its data will be deleted. The data cannot be restored, and Data Marts that read this table will fail until a connector loads it again.`}
        confirmLabel='Delete table'
        cancelLabel='Cancel'
        confirmDisabled={deleting}
        cancelDisabled={deleting}
        showCloseButton={!deleting}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
