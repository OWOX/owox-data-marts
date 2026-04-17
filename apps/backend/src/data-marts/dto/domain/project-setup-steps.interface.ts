export interface StepState {
  done: boolean;
  completedAt: string | null;
}

export interface ProjectSetupSteps {
  hasStorage: StepState;
  hasDraftDataMart: StepState;
  hasPublishedDataMart: StepState;
  hasDestination: StepState;
  hasReport: StepState;
  hasReportRun: StepState;
  hasTeammatesInvited: StepState;
}

export type SetupStepKey = keyof ProjectSetupSteps;

export const SETUP_STEP_KEYS: SetupStepKey[] = [
  'hasStorage',
  'hasDraftDataMart',
  'hasPublishedDataMart',
  'hasDestination',
  'hasReport',
  'hasReportRun',
  'hasTeammatesInvited',
];

/** Steps scoped to user + project (each user tracks independently) */
export const USER_SCOPED_STEP_KEYS: SetupStepKey[] = ['hasReportRun'];

/** Steps scoped to project only (shared across all users) */
export const PROJECT_SCOPED_STEP_KEYS: SetupStepKey[] = [
  'hasStorage',
  'hasDraftDataMart',
  'hasPublishedDataMart',
  'hasDestination',
  'hasReport',
  'hasTeammatesInvited',
];

export function createEmptySteps(): ProjectSetupSteps {
  return {
    hasStorage: { done: false, completedAt: null },
    hasDraftDataMart: { done: false, completedAt: null },
    hasPublishedDataMart: { done: false, completedAt: null },
    hasDestination: { done: false, completedAt: null },
    hasReport: { done: false, completedAt: null },
    hasReportRun: { done: false, completedAt: null },
    hasTeammatesInvited: { done: false, completedAt: null },
  };
}
