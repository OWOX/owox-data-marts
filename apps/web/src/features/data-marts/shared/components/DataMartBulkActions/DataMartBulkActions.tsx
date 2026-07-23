import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@owox/ui/components/alert-dialog';
import { Badge } from '@owox/ui/components/badge';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { ChevronDown, CircleCheckBig, ShieldCheck, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { DataStorageType } from '../../../../data-storage';
import { DataMartStatus } from '../../enums';
import { RunDataQualityBatchDialog } from '../RunDataQualityBatchDialog';

export interface DataMartBulkActionTarget {
  id: string;
  status: DataMartStatus;
  storageType?: DataStorageType;
}

interface DataMartBulkActionsProps {
  dataMarts: DataMartBulkActionTarget[];
  projectId: string;
  deleteDataMart: (id: string) => Promise<void>;
  publishDataMart: (id: string) => Promise<void>;
  onCompleted: () => void | Promise<void>;
  onClearDataMarts?: () => void;
}

export function DataMartBulkActions({
  dataMarts,
  projectId,
  deleteDataMart,
  publishDataMart,
  onCompleted,
  onClearDataMarts,
}: DataMartBulkActionsProps) {
  const [actionDataMarts, setActionDataMarts] = useState<DataMartBulkActionTarget[]>([]);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPublishConfirmation, setShowPublishConfirmation] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showRunQuality, setShowRunQuality] = useState(false);

  const draftDataMarts = useMemo(
    () => actionDataMarts.filter(dataMart => dataMart.status === DataMartStatus.DRAFT),
    [actionDataMarts]
  );
  const hasDraftDataMarts = dataMarts.some(dataMart => dataMart.status === DataMartStatus.DRAFT);

  if (dataMarts.length === 0) return null;

  const snapshotDataMarts = () => {
    const snapshot = dataMarts.map(dataMart => ({ ...dataMart }));
    setActionDataMarts(snapshot);
    return snapshot;
  };

  const handleBatchDelete = async () => {
    if (actionDataMarts.length === 0 || isDeleting) return;

    setIsDeleting(true);
    let successCount = 0;

    for (const dataMart of actionDataMarts) {
      try {
        await deleteDataMart(dataMart.id);
        successCount += 1;
      } catch (error) {
        console.error(`Error deleting data mart ${dataMart.id}:`, error);
      }
    }

    if (successCount > 0) {
      toast.success(
        `Successfully deleted ${String(successCount)} data mart${successCount === 1 ? '' : 's'}`
      );
    }

    const failedCount = actionDataMarts.length - successCount;
    if (failedCount > 0) {
      toast.error(
        `Failed to delete ${String(failedCount)} data mart${failedCount === 1 ? '' : 's'}. Please try again.`
      );
    }

    await Promise.allSettled([Promise.resolve().then(onCompleted)]);
    onClearDataMarts?.();
    setIsDeleting(false);
    setShowDeleteConfirmation(false);
  };

  const handleBatchPublish = async () => {
    if (draftDataMarts.length === 0 || isPublishing) return;

    setIsPublishing(true);
    let successCount = 0;

    for (const dataMart of draftDataMarts) {
      try {
        await publishDataMart(dataMart.id);
        successCount += 1;
      } catch (error) {
        console.error(`Error publishing data mart ${dataMart.id}:`, error);
      }
    }

    if (successCount > 0) {
      toast.success(
        `Successfully published ${String(successCount)} data mart${successCount === 1 ? '' : 's'}`,
        { duration: 10000 }
      );
    }

    const failedCount = draftDataMarts.length - successCount;
    if (failedCount > 0) {
      toast.error(
        `Failed to publish ${String(failedCount)} data mart${failedCount === 1 ? '' : 's'}. Please check ${failedCount === 1 ? 'it' : 'them'} independently.`,
        { duration: 10000 }
      );
    }

    await Promise.allSettled([Promise.resolve().then(onCompleted)]);
    onClearDataMarts?.();
    setIsPublishing(false);
    setShowPublishConfirmation(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='outline' size='sm' title='Bulk actions for selected data marts'>
            <span>Actions</span>
            <Badge
              variant='secondary'
              className='bg-muted text-muted-foreground rounded-full border-transparent px-1.5 py-0 text-xs'
            >
              {dataMarts.length}
            </Badge>
            <ChevronDown className='h-4 w-4' aria-hidden='true' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start'>
          <DropdownMenuItem
            disabled={!hasDraftDataMarts || isPublishing}
            onSelect={() => {
              snapshotDataMarts();
              setShowPublishConfirmation(true);
            }}
          >
            <CircleCheckBig aria-hidden='true' />
            Publish
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              snapshotDataMarts();
              setShowRunQuality(true);
            }}
            data-testid='run-selected-data-quality'
          >
            <ShieldCheck aria-hidden='true' />
            Check Quality
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant='destructive'
            disabled={isDeleting}
            onSelect={() => {
              snapshotDataMarts();
              setShowDeleteConfirmation(true);
            }}
          >
            <Trash2 aria-hidden='true' />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {showRunQuality && (
        <RunDataQualityBatchDialog
          open
          onOpenChange={next => {
            setShowRunQuality(next);
            if (!next) setActionDataMarts([]);
          }}
          dataMarts={actionDataMarts}
          projectId={projectId}
          onCompleted={onCompleted}
        />
      )}

      <AlertDialog open={showDeleteConfirmation} onOpenChange={setShowDeleteConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className='mt-2 block space-y-2'>
                <span className='block'>
                  You're about to delete{' '}
                  <strong>
                    {actionDataMarts.length} selected data mart
                    {actionDataMarts.length === 1 ? '' : 's'}
                  </strong>
                  . This action cannot be undone.
                </span>
                {actionDataMarts.some(
                  dataMart => dataMart.storageType === DataStorageType.LEGACY_GOOGLE_BIGQUERY
                ) && (
                  <span className='text-destructive block'>
                    Some of the selected data marts will also become unavailable in the Google
                    Sheets extension because they use legacy BigQuery storage.
                  </span>
                )}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void handleBatchDelete();
              }}
              disabled={isDeleting}
              className='bg-destructive hover:bg-destructive/90'
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showPublishConfirmation} onOpenChange={setShowPublishConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish Draft Data Marts?</AlertDialogTitle>
            <AlertDialogDescription>
              You're about to publish {draftDataMarts.length} draft data mart
              {draftDataMarts.length === 1 ? '' : 's'}.<br />
              Their schemas will be updated and they will become Published.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPublishing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void handleBatchPublish();
              }}
              disabled={isPublishing}
            >
              {isPublishing ? 'Publishing...' : 'Publish'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
