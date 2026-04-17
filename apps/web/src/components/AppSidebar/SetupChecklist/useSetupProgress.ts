import { useCallback, useMemo } from 'react';
import { SETUP_GROUPS, SETUP_STEPS } from './items';
import {
  GroupStatusType,
  ProgressKey,
  type GroupStatus,
  type GroupProgress,
  type ProjectSetupProgress,
} from './types';
import { useProjectId } from '../../../shared/hooks/useProjectId';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { setupProgressService } from './setup-progress.service';

export interface SetupProgressResult {
  progress: ProjectSetupProgress;
  completedStepIds: string[];
  completedCount: number;
  totalCount: number;
  percentage: number;
  isLoading: boolean;
  isAllComplete: boolean;
  groupProgresses: GroupProgress[];
  refetch: () => void;
}

const EMPTY_PROGRESS: ProjectSetupProgress = {
  [ProgressKey.HAS_STORAGE]: { done: false, completedAt: null },
  [ProgressKey.HAS_DRAFT_DATA_MART]: { done: false, completedAt: null },
  [ProgressKey.HAS_PUBLISHED_DATA_MART]: { done: false, completedAt: null },
  [ProgressKey.HAS_DESTINATION]: { done: false, completedAt: null },
  [ProgressKey.HAS_REPORT]: { done: false, completedAt: null },
  [ProgressKey.HAS_REPORT_RUN]: { done: false, completedAt: null },
  [ProgressKey.HAS_TEAMMATES_INVITED]: { done: false, completedAt: null },
};

function calculateGroupProgress(progress: ProjectSetupProgress): GroupProgress[] {
  return SETUP_GROUPS.map(group => {
    const stepIdsSet = new Set(group.stepIds);
    const steps = SETUP_STEPS.filter(step => stepIdsSet.has(step.id));
    const completedSteps = steps.filter(step => progress[step.progressKey].done);
    const completedCount = completedSteps.length;
    const totalCount = steps.length;

    let status: GroupStatus;
    if (completedCount === 0) {
      status = GroupStatusType.NOT_STARTED;
    } else if (completedCount === totalCount) {
      status = GroupStatusType.DONE;
    } else {
      status = GroupStatusType.IN_PROGRESS;
    }

    let completedAt: string | null = null;
    if (status === GroupStatusType.DONE) {
      const dates = completedSteps
        .map(step => progress[step.progressKey].completedAt)
        .filter((date): date is string => date !== null);
      if (dates.length > 0) {
        completedAt = dates.reduce((max, date) => (date > max ? date : max));
      }
    }

    return {
      group,
      status,
      completedCount,
      totalCount,
      completedAt,
    };
  });
}

/**
 * Query keys for the setup progress.
 */
export const setupProgressKeys = {
  all: ['setup-progress'] as const,
  byProject: (projectId: string) => [...setupProgressKeys.all, projectId] as const,
};

/**
 * Fetches the setup progress for the current project.
 */
export async function fetchSetupProgress(): Promise<ProjectSetupProgress> {
  const response = await setupProgressService.getProgress();
  return response.steps;
}

/**
 * Hook to get the setup progress for the current project.
 */
export function useSetupProgress(): SetupProgressResult {
  const projectId = useProjectId();

  const {
    data: progress = EMPTY_PROGRESS,
    isLoading,
    refetch: queryRefetch,
  } = useQuery({
    enabled: !!projectId,
    queryKey: projectId ? setupProgressKeys.byProject(projectId) : setupProgressKeys.all,
    queryFn: fetchSetupProgress,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const completedStepIds: string[] = [];

  for (const step of SETUP_STEPS) {
    if (progress[step.progressKey].done) {
      completedStepIds.push(step.id);
    }
  }

  const completedCount = completedStepIds.length;
  const totalCount = SETUP_STEPS.length;
  const percentage = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
  const groupProgresses = useMemo(() => calculateGroupProgress(progress), [progress]);
  const isAllComplete = completedCount >= totalCount;

  return {
    progress,
    completedStepIds,
    completedCount,
    totalCount,
    percentage,
    isLoading,
    isAllComplete,
    groupProgresses,
    refetch: () => {
      void queryRefetch();
    },
  };
}

/**
 * Hook to refresh the setup progress.
 */
export function useRefreshSetupProgress() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: setupProgressKeys.all,
      exact: false,
    });
  }, [queryClient]);
}
