import type { GroupProgress, GroupStatus, ProjectSetupProgress } from './types';
import { SETUP_GROUPS, SETUP_STEPS } from './items';

// Phase 1: mock data matching the API contract.
// Phase 3: replace with useState + useEffect + real API call to GET /api/project-setup-progress.
const MOCK_PROGRESS: ProjectSetupProgress = {
  hasStorage: { done: true, completedAt: new Date().toISOString() },
  hasDraftDataMart: { done: false, completedAt: null },
  hasPublishedDataMart: { done: false, completedAt: null },
  hasDestination: { done: false, completedAt: null },
  hasReport: { done: false, completedAt: null },
  hasReportRun: { done: false, completedAt: null },
  hasTeammatesInvited: { done: false, completedAt: null },
};

export interface SetupProgressResult {
  progress: ProjectSetupProgress;
  completedStepIds: string[];
  completedCount: number;
  totalCount: number;
  percentage: number;
  isLoading: boolean;
  isAllComplete: boolean;
  groupProgresses: GroupProgress[];
}

function calculateGroupProgress(progress: ProjectSetupProgress): GroupProgress[] {
  return SETUP_GROUPS.map(group => {
    const steps = SETUP_STEPS.filter(step => group.stepIds.includes(step.id));
    const completedSteps = steps.filter(step => progress[step.progressKey].done);
    const completedCount = completedSteps.length;
    const totalCount = steps.length;

    let status: GroupStatus;
    if (completedCount === 0) {
      status = 'not_started';
    } else if (completedCount === totalCount) {
      status = 'done';
    } else {
      status = 'in_progress';
    }

    // Calculate completedAt as max of all step completion dates (for 'done' status)
    let completedAt: string | null = null;
    if (status === 'done') {
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
  const progress = MOCK_PROGRESS;
  const isLoading = false;

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
  };
}
