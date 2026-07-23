import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ConfirmationDialog } from '../../../../../shared/components/ConfirmationDialog';
import { dataQualityQueryKeys } from '../../../data-quality/model/use-data-quality-workspace';
import {
  DATA_QUALITY_BATCH_LIMIT,
  dataQualityBatchApi,
  type DataQualityBatchRunItem,
} from './data-quality-batch.api';

interface RunDataQualityBatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataMarts: { id: string }[];
  projectId: string;
  onCompleted: () => void | Promise<void>;
}

export function RunDataQualityBatchDialog({
  open,
  onOpenChange,
  dataMarts,
  projectId,
  onCompleted,
}: RunDataQualityBatchDialogProps) {
  const queryClient = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const selectedCount = dataMarts.length;

  useEffect(() => {
    if (!open) setRequestError(null);
  }, [open]);

  const handleRun = async () => {
    if (selectedCount === 0 || isRunning) return;

    setIsRunning(true);
    setRequestError(null);

    const dataMartIds = dataMarts.map(dataMart => dataMart.id);
    const items: DataQualityBatchRunItem[] = [];
    let completedRequestCount = 0;

    for (let start = 0; start < dataMartIds.length; start += DATA_QUALITY_BATCH_LIMIT) {
      try {
        const response = await dataQualityBatchApi.run(
          dataMartIds.slice(start, start + DATA_QUALITY_BATCH_LIMIT)
        );
        items.push(...response.items);
        completedRequestCount += 1;
      } catch {
        // Each backend batch is independent. Continue so one transport error
        // does not prevent the remaining Data Marts from being queued.
      }
    }

    if (completedRequestCount === 0) {
      setRequestError('Data Quality checks could not be started. Please try again.');
      setIsRunning(false);
      return;
    }

    const successfulItems = items.filter(
      (item): item is Extract<DataQualityBatchRunItem, { status: 'SUCCESS' }> =>
        item.status === 'SUCCESS'
    );
    const refreshes = successfulItems.map(item =>
      Promise.resolve().then(() =>
        queryClient.invalidateQueries({
          queryKey: dataQualityQueryKeys.root(projectId, item.dataMartId),
        })
      )
    );

    await Promise.allSettled([...refreshes, Promise.resolve().then(onCompleted)]);
    setIsRunning(false);
    showBatchResult(selectedCount, successfulItems.length);
    onOpenChange(false);
  };

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={next => {
        if (!isRunning) onOpenChange(next);
      }}
      title='Check Data Quality'
      description={`Run Data Quality checks for ${String(selectedCount)} selected Data Mart${selectedCount === 1 ? '' : 's'}?`}
      confirmLabel={isRunning ? 'Starting…' : 'Check Quality'}
      cancelLabel='Cancel'
      confirmDisabled={selectedCount === 0 || isRunning}
      variant='brand'
      onConfirm={() => {
        void handleRun();
      }}
    >
      {requestError && <p className='text-destructive text-sm'>{requestError}</p>}
    </ConfirmationDialog>
  );
}

function showBatchResult(selectedCount: number, successfulCount: number): void {
  if (successfulCount === selectedCount) {
    toast.success(
      selectedCount === 1
        ? 'Data Quality check queued for 1 Data Mart'
        : `Data Quality checks queued for ${String(selectedCount)} Data Marts`
    );
    return;
  }

  if (successfulCount > 0) {
    toast.error(
      `Data Quality checks queued for ${String(successfulCount)} of ${String(selectedCount)} Data Marts`
    );
    return;
  }

  toast.error(
    selectedCount === 1
      ? 'Data Quality check could not be queued for the selected Data Mart'
      : 'Data Quality checks could not be queued for the selected Data Marts'
  );
}
