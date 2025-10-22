import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { TaskStatus } from '../../../../shared/types/task-status.enum.ts';
import { dataMartService } from '../services/data-mart.service';

interface UseSchemaActualizeTriggerReturn {
  run: () => Promise<void>;
  isLoading: boolean;
  cancel: () => Promise<void>;
  error: string | null;
}

const POLLING_INTERVAL = 1000;

export function useSchemaActualizeTrigger(
  dataMartId: string,
  onSuccess?: () => void
): UseSchemaActualizeTriggerReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentTriggerIdRef = useRef<string | null>(null);
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
      const errorMessage = e instanceof Error ? e.message : 'Schema actualization failed';
      toast.dismiss(triggerId);
      setSafeError(errorMessage);
      setSafeLoading(false);
      currentTriggerIdRef.current = null;
      abortControllerRef.current = null;
      toast.error(errorMessage, { duration: undefined, id: triggerId });
    },
    [setSafeError, setSafeLoading]
  );

  const cancel = useCallback(async (): Promise<void> => {
    const triggerId = currentTriggerIdRef.current;

    abortControllerRef.current?.abort();

    if (triggerId) {
      toast.dismiss(triggerId);
      try {
        await dataMartService.abortSchemaActualizeTrigger(dataMartId, triggerId);
      } catch {
        // ignore server abort errors
      }
    }

    currentTriggerIdRef.current = null;
    abortControllerRef.current = null;
    setSafeLoading(false);
  }, [dataMartId, setSafeLoading]);

  const pollTriggerStatus = useCallback(
    async (triggerId: string, signal: AbortSignal): Promise<void> => {
      const isFinal = (status: TaskStatus): boolean =>
        status === TaskStatus.SUCCESS ||
        status === TaskStatus.ERROR ||
        status === TaskStatus.CANCELLED;

      while (!signal.aborted && currentTriggerIdRef.current === triggerId) {
        try {
          const status = await dataMartService.getSchemaActualizeTriggerStatus(
            dataMartId,
            triggerId
          );

          if (isFinal(status)) {
            try {
              const response = await dataMartService.getSchemaActualizeTriggerResponse(
                dataMartId,
                triggerId
              );

              toast.dismiss(triggerId);
              if (response.success) {
                onSuccessRef.current?.();
                toast.success('Output schema actualized', { duration: undefined, id: triggerId });
              } else {
                const errorMessage = response.error ?? 'Schema actualization failed';
                setSafeError(errorMessage);
                toast.error(errorMessage, { duration: undefined, id: triggerId });
              }
            } catch (e) {
              const errorMessage = e instanceof Error ? e.message : 'Schema actualization failed';
              toast.dismiss(triggerId);
              setSafeError(errorMessage);
              toast.error(errorMessage, { duration: undefined, id: triggerId });
            }

            setSafeLoading(false);
            currentTriggerIdRef.current = null;
            abortControllerRef.current = null;
            return;
          }

          await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
        } catch (e) {
          handleError(e, triggerId);
        }
      }
    },
    [dataMartId, setSafeError, setSafeLoading, handleError]
  );

  const run = useCallback(async () => {
    if (currentTriggerIdRef.current) await cancel();

    setSafeError(null);
    setSafeLoading(true);

    try {
      const { triggerId } = await dataMartService.createSchemaActualizeTrigger(dataMartId);

      toast.loading('Synchronizing schema with the data storage state. This may take a while.', {
        duration: Infinity,
        id: triggerId,
      });

      currentTriggerIdRef.current = triggerId;
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        await pollTriggerStatus(triggerId, abortController.signal);
      } catch (e) {
        handleError(e, triggerId);
      }
    } catch (e) {
      setSafeLoading(false);
      setSafeError(e instanceof Error ? e.message : 'Failed to start schema actualization');
    }
  }, [dataMartId, cancel, pollTriggerStatus, setSafeError, setSafeLoading, handleError]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;

      const triggerId = currentTriggerIdRef.current;
      abortControllerRef.current?.abort();

      if (triggerId) {
        toast.dismiss(triggerId);
        dataMartService.abortSchemaActualizeTrigger(dataMartId, triggerId).catch(() => undefined);
      }

      currentTriggerIdRef.current = null;
      abortControllerRef.current = null;
    };
  }, [dataMartId]);

  return { run, isLoading, cancel, error };
}
