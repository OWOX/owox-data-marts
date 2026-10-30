import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Skeleton } from '@owox/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@owox/ui/components/table';
import { ConfirmationDialog } from '../../../../../shared/components/ConfirmationDialog';
import { formatBytes } from '../../../../../utils/format-bytes';
import { dataStorageApiService } from '../../api';
import type { OwoxStorageUsageResponseDto } from '../../api/types';

export function OwoxStorageUsage({ storageId }: { storageId: string }) {
  const [usage, setUsage] = useState<OwoxStorageUsageResponseDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [tableToDelete, setTableToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setUsage(await dataStorageApiService.getOwoxStorageUsage(storageId));
    } catch {
      setUsage(null);
      setFailed(true);
    }
  }, [storageId]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmDelete = async () => {
    if (!tableToDelete) return;
    setDeleting(true);
    try {
      await dataStorageApiService.deleteOwoxStorageTable(storageId, tableToDelete);
      setTableToDelete(null);
      await load();
    } catch {
      // The default error toast has already reported it; keep the dialog open to retry.
    } finally {
      setDeleting(false);
    }
  };

  if (failed) {
    return (
      <div className='flex items-center gap-3 text-sm'>
        <span>Storage usage could not be loaded.</span>
        <Button type='button' variant='outline' size='sm' onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  if (!usage) return <Skeleton className='h-24 w-full' />;

  const paid = usage.plan === 'PAID';
  const full = !paid && usage.usedBytes >= usage.limitBytes;

  return (
    <div className='space-y-3'>
      <p className='text-sm'>
        {paid
          ? `${formatBytes(usage.usedBytes)} used, ${formatBytes(usage.limitBytes)} included`
          : `${formatBytes(usage.usedBytes)} of ${formatBytes(usage.limitBytes)} used`}
      </p>
      {full && (
        <p className='bg-warning-bg text-warning rounded-md px-3 py-2 text-sm'>
          This storage is full. New connector runs are refused until you delete tables or upgrade
          the plan.
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
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
