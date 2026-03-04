import { useCallback, useEffect, useRef, useState } from 'react';
import { insightTemplateSourcesService } from '../services/insight-template-sources.service';
import type { InsightArtifactSqlPreviewTriggerResponseDto } from '../types/insight-template-sources.dto';

interface UseInsightTemplateSourceSqlPreviewTriggerReturn {
  runPreview: (sql?: string) => Promise<void>;
  isLoading: boolean;
  result: InsightArtifactSqlPreviewTriggerResponseDto | null;
  error: string | null;
  cancel: () => Promise<void>;
  reset: () => void;
}

const POLLING_INTERVAL = 1000;

export function useInsightTemplateSourceSqlPreviewTrigger(
  dataMartId: string,
  artifactId: string
): UseInsightTemplateSourceSqlPreviewTriggerReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<InsightArtifactSqlPreviewTriggerResponseDto | null>(null);
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
    const message = cause instanceof Error ? cause.message : 'Failed to execute SQL preview';
    setError(message);
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
      await insightTemplateSourcesService.abortInsightArtifactSqlPreviewTrigger(
        dataMartId,
        artifactId,
        triggerId
      );
    } catch (cancelError) {
      console.error('Failed to cancel SQL preview trigger:', cancelError);
    }
  }, [dataMartId, artifactId]);

  const pollTriggerStatus = useCallback(
    async (triggerId: string, signal: AbortSignal): Promise<void> => {
      while (!signal.aborted && isCurrentTrigger(triggerId)) {
        try {
          const { status } =
            await insightTemplateSourcesService.getInsightArtifactSqlPreviewTriggerStatus(
              dataMartId,
              artifactId,
              triggerId
            );

          if (status === 'SUCCESS' || status === 'ERROR' || status === 'CANCELLED') {
            try {
              const response =
                await insightTemplateSourcesService.getInsightArtifactSqlPreviewTriggerResponse(
                  dataMartId,
                  artifactId,
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
    [dataMartId, artifactId, isCurrentTrigger, setErrorMessage]
  );

  const runPreview = useCallback(
    async (sql?: string): Promise<void> => {
      if (!dataMartId || !artifactId) return;

      await cancel();

      setIsLoading(true);
      setResult(null);
      setError(null);

      try {
        const payload = sql ? { sql } : {};
        const { triggerId } =
          await insightTemplateSourcesService.createInsightArtifactSqlPreviewTrigger(
            dataMartId,
            artifactId,
            payload
          );

        const abortController = new AbortController();
        triggerStateRef.current = { triggerId, abortController };

        await pollTriggerStatus(triggerId, abortController.signal);
      } catch (runError) {
        setErrorMessage(runError);
      }
    },
    [cancel, dataMartId, artifactId, pollTriggerStatus, setErrorMessage]
  );

  useEffect(() => {
    return () => {
      const { triggerId, abortController } = triggerStateRef.current;

      abortController?.abort();

      if (triggerId && dataMartId && artifactId) {
        insightTemplateSourcesService
          .abortInsightArtifactSqlPreviewTrigger(dataMartId, artifactId, triggerId)
          .catch(() => undefined);
      }
    };
  }, [dataMartId, artifactId]);

  return {
    runPreview,
    isLoading,
    result,
    error,
    cancel,
    reset,
  };
}
