import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ConfirmationDialog } from '../../../../../shared/components/ConfirmationDialog';
import { dataQualityQueryKeys } from '../../../data-quality/model/use-data-quality-workspace';
import { dataQualityBatchApi, type DataQualityBatchRunItem } from './data-quality-batch.api';

interface RunDataQualityBatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataMarts: { id: string }[];
  projectId: string;
  onCompleted: () => void | Promise<void>;
  targetScope?: 'selection' | 'canvas';
}

export function RunDataQualityBatchDialog({
  open,
  onOpenChange,
  dataMarts,
  projectId,
  onCompleted,
  targetScope = 'selection',
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

    let items: DataQualityBatchRunItem[];
    try {
      const response = await dataQualityBatchApi.run(dataMarts.map(dataMart => dataMart.id));
      items = response.items;
    } catch (error) {
      setRequestError(`Data Quality checks could not be started: ${getErrorMessage(error)}`);
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
    refreshes.push(
      Promise.resolve().then(() =>
        queryClient.invalidateQueries({
          queryKey: dataQualityQueryKeys.summariesRoot(projectId),
        })
      )
    );

    const refreshResults = await Promise.allSettled(refreshes);
    let completionFailed = false;
    try {
      await onCompleted();
    } catch {
      completionFailed = true;
    }

    setIsRunning(false);
    showBatchResult(selectedCount, successfulItems.length, getFailedItems(items));
    if (
      successfulItems.length > 0 &&
      (completionFailed || refreshResults.some(result => result.status === 'rejected'))
    ) {
      toast.error(
        `The Data Quality check${successfulItems.length === 1 ? ' was' : 's were'} queued, but the Data Mart list could not be refreshed`
      );
    }
    onOpenChange(false);
  };

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={next => {
        if (!isRunning) onOpenChange(next);
      }}
      title='Check Data Quality'
      description={
        targetScope === 'canvas'
          ? `Run Data Quality checks for all ${String(selectedCount)} Data Mart${selectedCount === 1 ? '' : 's'} shown by the current canvas filters?`
          : `Run Data Quality checks for ${String(selectedCount)} selected Data Mart${selectedCount === 1 ? '' : 's'}?`
      }
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

function showBatchResult(
  selectedCount: number,
  successfulCount: number,
  failedItems: Extract<DataQualityBatchRunItem, { status: 'ERROR' }>[]
): void {
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
      `Data Quality checks queued for ${String(successfulCount)} of ${String(selectedCount)} Data Marts. ${formatFailureSummary(failedItems)}`
    );
    return;
  }

  toast.error(
    selectedCount === 1
      ? `Data Quality check could not be queued: ${failedItems[0]?.message ?? 'Unknown error'}`
      : `Data Quality checks could not be queued. ${formatFailureSummary(failedItems)}`
  );
}

function getFailedItems(
  items: DataQualityBatchRunItem[]
): Extract<DataQualityBatchRunItem, { status: 'ERROR' }>[] {
  return items.filter(
    (item): item is Extract<DataQualityBatchRunItem, { status: 'ERROR' }> => item.status === 'ERROR'
  );
}

function formatFailureSummary(
  failedItems: Extract<DataQualityBatchRunItem, { status: 'ERROR' }>[]
): string {
  if (failedItems.length === 0) return 'No typed failure details were returned';
  const messages = Array.from(new Set(failedItems.map(item => item.message)));
  if (messages.length === 1) {
    return `${String(failedItems.length)} failed: ${messages[0]}`;
  }
  const counts = new Map<string, number>();
  failedItems.forEach(item => counts.set(item.code, (counts.get(item.code) ?? 0) + 1));
  return `${String(failedItems.length)} failed (${Array.from(counts, ([code, count]) => `${code}: ${String(count)}`).join(', ')})`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Please try again';
}
