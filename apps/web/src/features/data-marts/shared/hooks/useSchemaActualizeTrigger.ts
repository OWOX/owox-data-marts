import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { TaskStatus } from '../enums/task-status.enum.ts';
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
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef<boolean>(false);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  const cancel = useCallback(async () => {
    if (currentTriggerIdRef.current) {
      try {
        await dataMartService.abortSchemaActualizeTrigger(dataMartId, currentTriggerIdRef.current);
      } catch {
        // ignore
      }
    }
    stopPolling();
    setIsLoading(false);
    currentTriggerIdRef.current = null;
    isProcessingRef.current = false;
  }, [dataMartId, stopPolling]);

  const poll = useCallback(
    async (triggerId: string) => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;
      try {
        const status = await dataMartService.getSchemaActualizeTriggerStatus(dataMartId, triggerId);
        if (
          status === TaskStatus.SUCCESS ||
          status === TaskStatus.ERROR ||
          status === TaskStatus.CANCELLED
        ) {
          stopPolling();
          try {
            const response = await dataMartService.getSchemaActualizeTriggerResponse(
              dataMartId,
              triggerId
            );
            if (response.success) {
              onSuccess?.();
              toast.success('Output schema actualized', { duration: undefined, id: triggerId });
            } else {
              setError(response.error ?? 'Schema actualization failed');
            }
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Schema actualization failed');
          }
          setIsLoading(false);
          currentTriggerIdRef.current = null;
          isProcessingRef.current = false;
        } else {
          isProcessingRef.current = false;
        }
      } catch (e) {
        stopPolling();
        setIsLoading(false);
        setError(e instanceof Error ? e.message : 'Schema actualization failed');
        currentTriggerIdRef.current = null;
        isProcessingRef.current = false;
      }
    },
    [dataMartId, onSuccess, stopPolling]
  );

  const run = useCallback(async () => {
    if (currentTriggerIdRef.current) await cancel();
    setError(null);
    setIsLoading(true);
    try {
      const { triggerId } = await dataMartService.createSchemaActualizeTrigger(dataMartId);
      toast.loading('Synchronizing schema with the data storage state. This may take a while.', {
        duration: Infinity,
        id: triggerId,
      });
      currentTriggerIdRef.current = triggerId;
      pollingIntervalRef.current = setInterval(() => {
        void poll(triggerId);
      }, POLLING_INTERVAL);
      await poll(triggerId);
    } catch (e) {
      setIsLoading(false);
      setError(e instanceof Error ? e.message : 'Failed to start schema actualization');
    }
  }, [dataMartId, cancel, poll]);

  useEffect(() => {
    return () => {
      stopPolling();
      if (currentTriggerIdRef.current) {
        dataMartService
          .abortSchemaActualizeTrigger(dataMartId, currentTriggerIdRef.current)
          .catch(() => {
            /* ignore */
          });
      }
    };
  }, [dataMartId, stopPolling]);

  return { run, isLoading, cancel, error };
}
