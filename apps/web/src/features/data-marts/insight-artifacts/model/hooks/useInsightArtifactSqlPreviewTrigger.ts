import { useCallback, useEffect, useRef, useState } from 'react';
import { extractApiError } from '../../../../../app/api';
import { TaskStatus } from '../../../../../shared/types/task-status.enum.ts';
import { insightArtifactsService } from '../services/insight-artifacts.service';
import type { InsightArtifactSqlPreviewResponseDto } from '../types/insight-artifacts.dto';

interface UseInsightArtifactSqlPreviewTriggerReturn {
  runPreview: (sql?: string) => Promise<void>;
  isLoading: boolean;
  result: InsightArtifactSqlPreviewResponseDto | null;
  error: string | null;
  cancel: () => Promise<void>;
  reset: () => void;
}

const POLLING_INTERVAL = 1000;
const FINAL_STATUSES = [TaskStatus.SUCCESS, TaskStatus.ERROR, TaskStatus.CANCELLED] as const;

export function useInsightArtifactSqlPreviewTrigger(
  dataMartId: string,
  insightArtifactId: string
): UseInsightArtifactSqlPreviewTriggerReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<InsightArtifactSqlPreviewResponseDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const triggerStateRef = useRef<{
    triggerId: string | null;
    abortController: AbortController | null;
  }>({
    triggerId: null,
    abortController: null,
  });

  const isCurrentTrigger = useCallback((triggerId: string): boolean => {
    return triggerStateRef.current.triggerId === triggerId;
  }, []);

  const setErrorMessage = useCallback((cause: unknown): void => {
    const apiError = extractApiError(cause);
    setError(
      apiError.message ?? (cause instanceof Error ? cause.message : 'Failed to execute SQL preview')
    );
    setIsLoading(false);
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setIsLoading(false);
  }, []);

  const cancel = useCallback(async (): Promise<void> => {
    const { triggerId, abortController } = triggerStateRef.current;

    if (!triggerId) return;

    abortController?.abort();

    triggerStateRef.current = { triggerId: null, abortController: null };
    setIsLoading(false);

    try {
      await insightArtifactsService.abortInsightArtifactSqlPreviewTrigger(
        dataMartId,
        insightArtifactId,
        triggerId
      );
    } catch (cancelError) {
      console.error('Failed to cancel SQL preview trigger:', cancelError);
    }
  }, [dataMartId, insightArtifactId]);

  const pollTriggerStatus = useCallback(
    async (triggerId: string, signal: AbortSignal): Promise<void> => {
      while (!signal.aborted && isCurrentTrigger(triggerId)) {
        try {
          const status = await insightArtifactsService.getInsightArtifactSqlPreviewTriggerStatus(
            dataMartId,
            insightArtifactId,
            triggerId
          );

          if (FINAL_STATUSES.includes(status as (typeof FINAL_STATUSES)[number])) {
            try {
              const response =
                await insightArtifactsService.getInsightArtifactSqlPreviewTriggerResponse(
                  dataMartId,
                  insightArtifactId,
                  triggerId
                );
              setResult(response);
              setError(null);
            } catch (responseError) {
              setResult(null);
              setErrorMessage(responseError);
            }

            setIsLoading(false);
            triggerStateRef.current = { triggerId: null, abortController: null };
            return;
          }

          await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
        } catch (statusError) {
          setErrorMessage(statusError);
          triggerStateRef.current = { triggerId: null, abortController: null };
          return;
        }
      }
    },
    [dataMartId, insightArtifactId, isCurrentTrigger, setErrorMessage]
  );

  const runPreview = useCallback(
    async (sql?: string): Promise<void> => {
      if (!dataMartId || !insightArtifactId) return;

      await cancel();

      setIsLoading(true);
      setResult(null);
      setError(null);

      try {
        const payload = sql ? { sql } : {};
        const { triggerId } = await insightArtifactsService.createInsightArtifactSqlPreviewTrigger(
          dataMartId,
          insightArtifactId,
          payload
        );

        const abortController = new AbortController();
        triggerStateRef.current = { triggerId, abortController };

        await pollTriggerStatus(triggerId, abortController.signal);
      } catch (runError) {
        setErrorMessage(runError);
      }
    },
    [cancel, dataMartId, insightArtifactId, pollTriggerStatus, setErrorMessage]
  );

  useEffect(() => {
    return () => {
      const { triggerId, abortController } = triggerStateRef.current;

      abortController?.abort();

      if (triggerId && dataMartId && insightArtifactId) {
        insightArtifactsService
          .abortInsightArtifactSqlPreviewTrigger(dataMartId, insightArtifactId, triggerId)
          .catch(() => undefined);
      }
    };
  }, [dataMartId, insightArtifactId]);

  return {
    runPreview,
    isLoading,
    result,
    error,
    cancel,
    reset,
  };
}
