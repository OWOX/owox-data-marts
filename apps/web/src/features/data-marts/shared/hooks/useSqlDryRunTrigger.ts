import { useCallback, useEffect, useRef, useState } from 'react';
import { TaskStatus } from '../../../../shared/types/task-status.enum.ts';
import { dataMartService } from '../services/data-mart.service';

interface SqlValidationResult {
  isValid: boolean;
  error?: string;
  bytes?: number;
}

interface UseSqlDryRunTriggerReturn {
  validateSql: (sql: string) => Promise<void>;
  isLoading: boolean;
  result: SqlValidationResult | null;
  cancel: () => Promise<void>;
}

const POLLING_INTERVAL = 1000; // 1 second
const FINAL_STATUSES = [TaskStatus.SUCCESS, TaskStatus.ERROR, TaskStatus.CANCELLED] as const;

/**
 * Hook for SQL dry run validation using triggers.
 * Provides methods to validate SQL, check status, and cancel validation.
 */
export function useSqlDryRunTrigger(dataMartId: string): UseSqlDryRunTriggerReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SqlValidationResult | null>(null);

  const validationStateRef = useRef<{
    triggerId: string | null;
    abortController: AbortController | null;
  }>({
    triggerId: null,
    abortController: null,
  });

  const isCurrentTrigger = useCallback((triggerId: string): boolean => {
    return validationStateRef.current.triggerId === triggerId;
  }, []);

  const setErrorResult = useCallback((error: unknown): void => {
    setResult({
      isValid: false,
      error: error instanceof Error ? error.message : 'Validation failed',
    });
    setIsLoading(false);
  }, []);

  /**
   * Cancels the current validation
   */
  const cancel = useCallback(async (): Promise<void> => {
    const { triggerId, abortController } = validationStateRef.current;

    if (!triggerId) return;

    abortController?.abort();

    validationStateRef.current = { triggerId: null, abortController: null };
    setResult(null);
    setIsLoading(false);

    try {
      await dataMartService.abortSqlDryRunTrigger(dataMartId, triggerId);
    } catch (error) {
      console.error('Failed to cancel trigger:', error);
    }
  }, [dataMartId]);

  const pollTriggerStatus = useCallback(
    async (triggerId: string, signal: AbortSignal): Promise<void> => {
      while (!signal.aborted && isCurrentTrigger(triggerId)) {
        try {
          const status = await dataMartService.getSqlDryRunTriggerStatus(dataMartId, triggerId);

          if (FINAL_STATUSES.includes(status as (typeof FINAL_STATUSES)[number])) {
            const response = await dataMartService.getSqlDryRunTriggerResponse(
              dataMartId,
              triggerId
            );

            setResult({
              isValid: response.isValid,
              error: response.error ?? undefined,
              bytes: response.bytes,
            });

            setIsLoading(false);
            validationStateRef.current = { triggerId: null, abortController: null };
            return;
          }

          await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
        } catch (error) {
          setErrorResult(error);
          validationStateRef.current = { triggerId: null, abortController: null };
          return;
        }
      }
    },
    [dataMartId, isCurrentTrigger, setErrorResult]
  );

  /**
   * Validates SQL by creating a trigger and polling for results
   */
  const validateSql = useCallback(
    async (sql: string): Promise<void> => {
      await cancel();

      setIsLoading(true);
      setResult(null);

      try {
        const { triggerId } = await dataMartService.createSqlDryRunTrigger(dataMartId, sql);
        const abortController = new AbortController();

        validationStateRef.current = { triggerId, abortController };

        await pollTriggerStatus(triggerId, abortController.signal);
      } catch (error) {
        setErrorResult(error);
      }
    },
    [dataMartId, cancel, pollTriggerStatus, setErrorResult]
  );

  useEffect(() => {
    return () => {
      const { triggerId, abortController } = validationStateRef.current;

      abortController?.abort();

      if (triggerId) {
        dataMartService.abortSqlDryRunTrigger(dataMartId, triggerId).catch(() => undefined);
      }
    };
  }, [dataMartId]);

  return {
    validateSql,
    isLoading,
    result,
    cancel,
  };
}
