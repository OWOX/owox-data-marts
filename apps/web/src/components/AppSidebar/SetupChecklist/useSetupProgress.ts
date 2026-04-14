import { useState, useEffect, useCallback } from 'react';
import type { GroupProgress, ProjectSetupProgress } from './types';
import { SETUP_GROUPS, SETUP_STEPS } from './items';
import { GroupStatusType, type GroupStatus } from './types';
import { useProjectId } from '../../../shared/hooks/useProjectId';
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
  hasStorage: { done: false, completedAt: null },
  hasDraftDataMart: { done: false, completedAt: null },
  hasPublishedDataMart: { done: false, completedAt: null },
  hasDestination: { done: false, completedAt: null },
  hasReport: { done: false, completedAt: null },
  hasReportRun: { done: false, completedAt: null },
  hasTeammatesInvited: { done: false, completedAt: null },
};

function calculateGroupProgress(progress: ProjectSetupProgress): GroupProgress[] {
  return SETUP_GROUPS.map(group => {
    const steps = SETUP_STEPS.filter(step => group.stepIds.includes(step.id));
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
        completedAt = dates.sort()[dates.length - 1];
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

export function useSetupProgress(): SetupProgressResult {
  const projectId = useProjectId();
  const [progress, setProgress] = useState<ProjectSetupProgress>(EMPTY_PROGRESS);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProgress = useCallback(async () => {
    if (!projectId) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await setupProgressService.getProgress();
      setProgress(response.steps);
    } catch {
      // Silently fail — show empty progress rather than breaking the sidebar
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void fetchProgress();
  }, [fetchProgress]);

  const completedStepIds = SETUP_STEPS.filter(step => progress[step.progressKey].done).map(
    step => step.id
  );
  const completedCount = completedStepIds.length;
  const totalCount = SETUP_STEPS.length;
  const percentage = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
  const groupProgresses = calculateGroupProgress(progress);

  return {
    progress,
    completedStepIds,
    completedCount,
    totalCount,
    percentage,
    isLoading,
    isAllComplete: completedCount === totalCount,
    groupProgresses,
    refetch: () => void fetchProgress(),
  };
}
