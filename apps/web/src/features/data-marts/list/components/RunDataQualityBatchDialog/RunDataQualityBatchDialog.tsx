import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '@owox/ui/components/badge';
import { Button } from '@owox/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@owox/ui/components/dialog';
import { dataQualityService } from '../../../data-quality/api/data-quality.service';
import { dataQualityQueryKeys } from '../../../data-quality/model/use-data-quality-workspace';
import type { DataQualityConfigResponse } from '../../../data-quality/model/types';
import type { DataMartListItem } from '../../model/types';
import {
  dataQualityBatchApi,
  type DataQualityBatchRunItem,
  type DataQualityBatchRunResponse,
} from './data-quality-batch.api';

interface RunDataQualityBatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataMarts: DataMartListItem[];
  projectId: string;
  onCompleted: () => void | Promise<void>;
}

interface EligibilityItem {
  dataMart: DataMartListItem;
  state: 'LOADING' | 'ELIGIBLE' | 'INELIGIBLE';
  reason: string | null;
}

const ELIGIBILITY_REASON_LABELS: Record<string, string> = {
  NOT_PUBLISHED: 'Published Data Mart required',
  OUTPUT_SCHEMA_REQUIRED: 'Output Schema required',
  DEFINITION_REQUIRED: 'Data definition required',
  NO_APPLICABLE_CHECKS: 'No applicable checks enabled',
  ACTIVE_RUN: 'A Quality run is already active',
};

const ELIGIBILITY_CONCURRENCY = 8;

export function RunDataQualityBatchDialog({
  open,
  onOpenChange,
  dataMarts,
  projectId,
  onCompleted,
}: RunDataQualityBatchDialogProps) {
  const queryClient = useQueryClient();
  const [eligibility, setEligibility] = useState<EligibilityItem[]>([]);
  const [results, setResults] = useState<Map<string, DataQualityBatchRunItem> | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setEligibility([]);
      setResults(null);
      setRequestError(null);
      return;
    }

    let cancelled = false;
    setResults(null);
    setRequestError(null);
    setEligibility(dataMarts.map(dataMart => ({ dataMart, state: 'LOADING', reason: null })));

    void mapWithConcurrency(dataMarts, ELIGIBILITY_CONCURRENCY, async dataMart => {
      try {
        const config = await dataQualityService.getConfig(dataMart.id);
        return toEligibility(dataMart, config);
      } catch {
        return {
          dataMart,
          state: 'INELIGIBLE' as const,
          reason: 'Unable to determine eligibility',
        };
      }
    }).then(items => {
      if (!cancelled) setEligibility(items);
    });

    return () => {
      cancelled = true;
    };
  }, [dataMarts, open]);

  const eligibleItems = useMemo(
    () => eligibility.filter(item => item.state === 'ELIGIBLE'),
    [eligibility]
  );
  const isEligibilityLoading = eligibility.some(item => item.state === 'LOADING');

  const handleRun = async () => {
    if (eligibleItems.length === 0 || isRunning) return;
    setIsRunning(true);
    setRequestError(null);

    let response: DataQualityBatchRunResponse;
    try {
      response = await dataQualityBatchApi.run(eligibleItems.map(item => item.dataMart.id));
    } catch {
      setRequestError('Data Quality runs could not be created. Please try again.');
      setIsRunning(false);
      return;
    }

    setResults(new Map(response.items.map(item => [item.dataMartId, item])));

    const refreshes = response.items
      .filter(
        (item): item is Extract<DataQualityBatchRunItem, { status: 'SUCCESS' }> =>
          item.status === 'SUCCESS'
      )
      .map(item =>
        Promise.resolve().then(() =>
          queryClient.invalidateQueries({
            queryKey: dataQualityQueryKeys.root(projectId, item.dataMartId),
          })
        )
      );

    await Promise.allSettled([...refreshes, Promise.resolve().then(onCompleted)]);
    setIsRunning(false);
  };

  const runLabel =
    eligibleItems.length > 0
      ? `Run Quality for ${String(eligibleItems.length)} Data Mart${eligibleItems.length === 1 ? '' : 's'}`
      : 'Run Quality';

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!isRunning) onOpenChange(next);
      }}
    >
      <DialogContent className='max-h-[85vh] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Run Data Quality</DialogTitle>
          <DialogDescription>
            Eligible Data Marts are queued independently. Ineligible items remain unchanged.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-2' aria-live='polite'>
          {eligibility.map(item => {
            const result = results?.get(item.dataMart.id);
            return (
              <div
                key={item.dataMart.id}
                data-testid={`quality-eligibility-${item.dataMart.id}`}
                className='flex items-start justify-between gap-4 rounded-md border p-3'
              >
                <div className='min-w-0'>
                  <p className='truncate text-sm font-medium'>{item.dataMart.title}</p>
                  {item.reason && (
                    <p className='text-muted-foreground mt-1 text-xs'>{item.reason}</p>
                  )}
                  {result?.status === 'ERROR' && (
                    <p className='text-destructive mt-1 text-xs'>{result.message}</p>
                  )}
                </div>
                {result ? (
                  <Badge variant={result.status === 'SUCCESS' ? 'outline' : 'destructive'}>
                    {result.status === 'SUCCESS' ? 'Queued' : 'Failed'}
                  </Badge>
                ) : (
                  <Badge variant={item.state === 'INELIGIBLE' ? 'destructive' : 'outline'}>
                    {item.state === 'LOADING'
                      ? 'Checking…'
                      : item.state === 'ELIGIBLE'
                        ? 'Eligible'
                        : 'Ineligible'}
                  </Badge>
                )}
              </div>
            );
          })}
        </div>

        {requestError && <p className='text-destructive text-sm'>{requestError}</p>}

        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            disabled={isRunning}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {results ? 'Close' : 'Cancel'}
          </Button>
          {!results && (
            <Button
              type='button'
              disabled={isEligibilityLoading || eligibleItems.length === 0 || isRunning}
              onClick={() => {
                void handleRun();
              }}
            >
              {isRunning ? 'Queueing…' : runLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toEligibility(
  dataMart: DataMartListItem,
  config: DataQualityConfigResponse
): EligibilityItem {
  if (config.permissions.canRun && config.runEligibility.eligible) {
    return { dataMart, state: 'ELIGIBLE', reason: null };
  }
  const code = config.runEligibility.code;
  return {
    dataMart,
    state: 'INELIGIBLE',
    reason:
      (code ? ELIGIBILITY_REASON_LABELS[code] : null) ??
      (config.permissions.canEdit ? 'Not eligible for a Quality run' : 'Edit permission required'),
  };
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const indexedItems = items.map((item, index) => ({ index, item }));
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const indexedItem = indexedItems[index];
      results[indexedItem.index] = await mapper(indexedItem.item);
    }
  });

  await Promise.all(workers);
  return results;
}
