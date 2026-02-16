import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { TaskStatus } from '../../../../shared/types/task-status.enum.ts';
import { dataStorageApiService } from '../api';

interface UsePublishDraftsTriggerReturn {
  run: (dataStorageId: string) => Promise<void>;
  isLoading: boolean;
  cancel: () => Promise<void>;
  error: string | null;
}

const POLLING_INTERVAL = 1000;

export function usePublishDraftsTrigger(onSuccess?: () => void): UsePublishDraftsTriggerReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentTriggerIdRef = useRef<string | null>(null);
  const currentDataStorageIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const isMountedRef = useRef<boolean>(true);

  const onSuccessRef = useRef<typeof onSuccess>(onSuccess);
  onSuccessRef.current = onSuccess;

  const setSafeLoading = useCallback((val: boolean) => {
    if (isMountedRef.current) setIsLoading(val);
  }, []);
  const setSafeError = useCallback((val: string | null) => {
    if (isMountedRef.current) setError(val);
  }, []);

  const handleError = useCallback(
    (e: unknown, triggerId: string) => {
      const errorMessage = e instanceof Error ? e.message : 'Publishing drafts failed';
      toast.dismiss(triggerId);
      setSafeError(errorMessage);
      setSafeLoading(false);
      currentTriggerIdRef.current = null;
      currentDataStorageIdRef.current = null;
      abortControllerRef.current = null;
      toast.error(errorMessage, { duration: undefined, id: triggerId });
    },
    [setSafeError, setSafeLoading]
  );

  const cancel = useCallback(async (): Promise<void> => {
    const triggerId = currentTriggerIdRef.current;
    const storageId = currentDataStorageIdRef.current;

    abortControllerRef.current?.abort();

    if (triggerId && storageId) {
      toast.dismiss(triggerId);
      try {
        await dataStorageApiService.abortPublishDraftsTrigger(storageId, triggerId);
      } catch {
        // ignore server abort errors
      }
    }

    currentTriggerIdRef.current = null;
    currentDataStorageIdRef.current = null;
    abortControllerRef.current = null;
    setSafeLoading(false);
  }, [setSafeLoading]);

  const pollTriggerStatus = useCallback(
    async (dataStorageId: string, triggerId: string, signal: AbortSignal): Promise<void> => {
      const isFinal = (status: TaskStatus): boolean =>
        status === TaskStatus.SUCCESS ||
        status === TaskStatus.ERROR ||
        status === TaskStatus.CANCELLED;

      while (!signal.aborted && currentTriggerIdRef.current === triggerId) {
        try {
          const status = await dataStorageApiService.getPublishDraftsTriggerStatus(
            dataStorageId,
            triggerId
          );

          if (isFinal(status)) {
            try {
              const response = await dataStorageApiService.getPublishDraftsTriggerResponse(
                dataStorageId,
                triggerId
              );

              toast.dismiss(triggerId);

              if (response.error) {
                setSafeError(response.error);
                toast.error(response.error, { duration: undefined, id: `${triggerId}-error` });
              } else {
                if (response.successCount > 0) {
                  toast.success(
                    `Successfully published ${String(response.successCount)} data mart draft${response.successCount !== 1 ? 's' : ''}`,
                    { duration: 10000, id: `${triggerId}-success` }
                  );
                }

                if (response.failedCount > 0) {
                  toast.error(
                    `Failed to publish ${String(response.failedCount)} data mart draft${response.failedCount !== 1 ? 's' : ''}. Please check ${response.failedCount !== 1 ? 'them' : 'it'} independently.`,
                    { duration: 10000, id: `${triggerId}-error` }
                  );
                }

                if (response.successCount === 0 && response.failedCount === 0) {
                  toast.success('No drafts to publish', { duration: 5000, id: triggerId });
                }

                onSuccessRef.current?.();
              }
            } catch (e) {
              const errorMessage = e instanceof Error ? e.message : 'Publishing drafts failed';
              toast.dismiss(triggerId);
              setSafeError(errorMessage);
              toast.error(errorMessage, { duration: undefined, id: triggerId });
            }

            setSafeLoading(false);
            currentTriggerIdRef.current = null;
            currentDataStorageIdRef.current = null;
            abortControllerRef.current = null;
            return;
          }

          await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
        } catch (e) {
          handleError(e, triggerId);
        }
      }
    },
    [setSafeError, setSafeLoading, handleError]
  );

  const run = useCallback(
    async (dataStorageId: string) => {
      if (currentTriggerIdRef.current) await cancel();

      setSafeError(null);
      setSafeLoading(true);

      try {
        const { triggerId } = await dataStorageApiService.createPublishDraftsTrigger(dataStorageId);

        toast.loading('Publishing data mart drafts. This may take a while.', {
          duration: Infinity,
          id: triggerId,
        });

        currentTriggerIdRef.current = triggerId;
        currentDataStorageIdRef.current = dataStorageId;
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        try {
          await pollTriggerStatus(dataStorageId, triggerId, abortController.signal);
        } catch (e) {
          handleError(e, triggerId);
        }
      } catch (e) {
        setSafeLoading(false);
        setSafeError(e instanceof Error ? e.message : 'Failed to start publishing drafts');
      }
    },
    [cancel, pollTriggerStatus, setSafeError, setSafeLoading, handleError]
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;

      const triggerId = currentTriggerIdRef.current;
      const storageId = currentDataStorageIdRef.current;
      abortControllerRef.current?.abort();

      if (triggerId && storageId) {
        toast.dismiss(triggerId);
        dataStorageApiService
          .abortPublishDraftsTrigger(storageId, triggerId)
          .catch(() => undefined);
      }

      currentTriggerIdRef.current = null;
      currentDataStorageIdRef.current = null;
      abortControllerRef.current = null;
    };
  }, []);

  return { run, isLoading, cancel, error };
}
