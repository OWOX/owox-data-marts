import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { TaskStatus } from '../../../../shared/types/task-status.enum.ts';
import { extractApiError, type ApiError } from '../../../../app/api';
import { dataMartService } from '../services/data-mart.service';
import { invalidateDataStorageHealthStatus } from '../../../data-storage/shared/services/data-storage-health-status.service';
import { isStorageOAuthRefreshError } from '../utils/storage-oauth-refresh-error.utils';

interface UseSchemaActualizeTriggerReturn {
  run: () => Promise<void>;
  isLoading: boolean;
  cancel: () => Promise<void>;
  error: string | null;
}

const POLLING_INTERVAL = 1000;

interface SchemaActualizeErrorBody extends ApiError {
  error?: string;
}

interface SchemaActualizeError {
  message: string;
  code?: string;
}

function extractApiErrorBody(error: unknown): SchemaActualizeErrorBody | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  return extractApiError(error) as SchemaActualizeErrorBody | undefined;
}

function extractSchemaActualizeError(error: unknown, fallback: string): SchemaActualizeError {
  const apiError = extractApiErrorBody(error);

  return {
    message:
      apiError?.error ?? apiError?.message ?? (error instanceof Error ? error.message : fallback),
    code: apiError?.code,
  };
}

function invalidateStorageHealthForError(error: SchemaActualizeError, storageId?: string): void {
  if (!storageId || !isStorageOAuthRefreshError(error)) {
    return;
  }

  invalidateDataStorageHealthStatus(storageId);
}

export function useSchemaActualizeTrigger(
  dataMartId: string,
  onSuccess?: () => void,
  storageId?: string
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
      const error = extractSchemaActualizeError(e, 'Schema actualization failed');
      invalidateStorageHealthForError(error, storageId);
      toast.dismiss(triggerId);
      setSafeError(error.message);
      setSafeLoading(false);
      currentTriggerIdRef.current = null;
      abortControllerRef.current = null;
      toast.error(error.message, { duration: undefined, id: triggerId });
    },
    [setSafeError, setSafeLoading, storageId]
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
                const error = {
                  message: response.error ?? 'Schema actualization failed',
                  code: response.code,
                };
                invalidateStorageHealthForError(error, storageId);
                setSafeError(error.message);
                toast.error(error.message, { duration: undefined, id: triggerId });
              }
            } catch (e) {
              const error = extractSchemaActualizeError(e, 'Schema actualization failed');
              invalidateStorageHealthForError(error, storageId);
              toast.dismiss(triggerId);
              setSafeError(error.message);
              toast.error(error.message, { duration: undefined, id: triggerId });
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
    [dataMartId, setSafeError, setSafeLoading, handleError, storageId]
  );

  const run = useCallback(async () => {
    if (currentTriggerIdRef.current) await cancel();

    setSafeError(null);
    setSafeLoading(true);

    try {
      const { triggerId } = await dataMartService.createSchemaActualizeTrigger(dataMartId);

      toast.loading('Synchronizing output schema with the storage state. Please wait...', {
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
      const error = extractSchemaActualizeError(e, 'Failed to start schema actualization');
      invalidateStorageHealthForError(error, storageId);
      setSafeError(error.message);
    }
  }, [dataMartId, cancel, pollTriggerStatus, setSafeError, setSafeLoading, handleError, storageId]);

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
