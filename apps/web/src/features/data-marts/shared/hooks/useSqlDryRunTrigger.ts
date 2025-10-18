import { useCallback, useEffect, useRef, useState } from 'react';
import { TaskStatus } from '../enums/task-status.enum.ts';
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

/**
 * Hook for SQL dry run validation using triggers.
 * Provides methods to validate SQL, check status, and cancel validation.
 */
export function useSqlDryRunTrigger(dataMartId: string): UseSqlDryRunTriggerReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SqlValidationResult | null>(null);
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
        await dataMartService.abortSqlDryRunTrigger(dataMartId, currentTriggerIdRef.current);
      } catch (error) {
        console.error('Failed to cancel trigger:', error);
      }
    }
    stopPolling();
    setIsLoading(false);
    currentTriggerIdRef.current = null;
    isProcessingRef.current = false;
  }, [dataMartId, stopPolling]);

  const pollTriggerStatus = useCallback(
    async (triggerId: string) => {
      // Prevent multiple simultaneous polls
      if (isProcessingRef.current) {
        return;
      }

      isProcessingRef.current = true;

      try {
        const status = await dataMartService.getSqlDryRunTriggerStatus(dataMartId, triggerId);

        if (
          status === TaskStatus.SUCCESS ||
          status === TaskStatus.ERROR ||
          status === TaskStatus.CANCELLED
        ) {
          // Stop polling immediately to prevent race conditions
          stopPolling();

          try {
            const response = await dataMartService.getSqlDryRunTriggerResponse(
              dataMartId,
              triggerId
            );
            setResult({
              isValid: response.isValid,
              error: response.error ?? undefined,
              bytes: response.bytes,
            });
          } catch (error) {
            setResult({
              isValid: false,
              error: error instanceof Error ? error.message : 'Validation failed',
            });
          }

          setIsLoading(false);
          currentTriggerIdRef.current = null;
          isProcessingRef.current = false;
        } else {
          // Status is still IDLE or PROCESSING, allow next poll
          isProcessingRef.current = false;
        }
      } catch (error) {
        stopPolling();
        setIsLoading(false);
        setResult({
          isValid: false,
          error: error instanceof Error ? error.message : 'Validation failed',
        });
        currentTriggerIdRef.current = null;
        isProcessingRef.current = false;
      }
    },
    [dataMartId, stopPolling]
  );

  const validateSql = useCallback(
    async (sql: string) => {
      // Cancel previous validation
      if (currentTriggerIdRef.current) {
        await cancel();
      }

      setIsLoading(true);
      setResult(null);

      try {
        const { triggerId } = await dataMartService.createSqlDryRunTrigger(dataMartId, sql);
        currentTriggerIdRef.current = triggerId;

        // Start polling
        pollingIntervalRef.current = setInterval(() => {
          void pollTriggerStatus(triggerId);
        }, POLLING_INTERVAL);

        // Initial poll
        await pollTriggerStatus(triggerId);
      } catch (error) {
        setIsLoading(false);
        setResult({
          isValid: false,
          error: error instanceof Error ? error.message : 'Failed to start validation',
        });
      }
    },
    [dataMartId, cancel, pollTriggerStatus]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
      if (currentTriggerIdRef.current) {
        dataMartService.abortSqlDryRunTrigger(dataMartId, currentTriggerIdRef.current).catch(() => {
          // Ignore errors on cleanup
        });
      }
    };
  }, [dataMartId, stopPolling]);

  return {
    validateSql,
    isLoading,
    result,
    cancel,
  };
}
