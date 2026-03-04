import { useCallback } from 'react';
import { useAutoRefresh } from '../../../../hooks/useAutoRefresh.ts';
import { insightsService } from '../model';
import { TaskStatus } from '../../../../shared/types/task-status.enum.ts';

interface UseInsightExecutionPollingProps {
  dataMartId: string;
  triggerId: string | null;
  insightId: string;
  onRunFinished: () => void;
  onError: (error: Error) => void;
}
export function useInsightExecutionPolling({
  dataMartId,
  triggerId,
  insightId,
  onRunFinished,
  onError,
}: UseInsightExecutionPollingProps) {
  const checkRunStatus = useCallback(
    async (signal: AbortSignal) => {
      if (!dataMartId || !triggerId) return;
      try {
        const response = await insightsService.checkInsightExecutionStatus(
          dataMartId,
          triggerId,
          insightId,
          {
            skipLoadingIndicator: true,
            signal,
          }
        );
        if (
          [TaskStatus.SUCCESS, TaskStatus.ERROR, TaskStatus.CANCELLED].includes(response.status)
        ) {
          onRunFinished();
        }
      } catch (error) {
        onError(error as Error);
      }
    },
    [dataMartId, triggerId, insightId, onRunFinished, onError]
  );
  useAutoRefresh({
    enabled: Boolean(dataMartId && triggerId),
    intervalMs: 2500,
    onlyWhenVisible: true,
    onTick: checkRunStatus,
  });
}
