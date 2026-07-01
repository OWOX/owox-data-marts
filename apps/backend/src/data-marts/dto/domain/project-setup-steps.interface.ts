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
  hasGoogleSheetsDestination: StepState;
  hasGoogleSheetsExtension: StepState;
  hasGoogleSheetsReportRun: StepState;
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
  'hasGoogleSheetsDestination',
  'hasGoogleSheetsExtension',
  'hasGoogleSheetsReportRun',
];

/** Steps scoped to user + project (each user tracks independently) */
export const USER_SCOPED_STEP_KEYS: SetupStepKey[] = [
  'hasReportRun',
  'hasGoogleSheetsExtension',
  'hasGoogleSheetsReportRun',
];

/** Steps scoped to project only (shared across all users) */
export const PROJECT_SCOPED_STEP_KEYS: SetupStepKey[] = [
  'hasStorage',
  'hasDraftDataMart',
  'hasPublishedDataMart',
  'hasDestination',
  'hasReport',
  'hasTeammatesInvited',
  'hasGoogleSheetsDestination',
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
    hasGoogleSheetsDestination: { done: false, completedAt: null },
    hasGoogleSheetsExtension: { done: false, completedAt: null },
    hasGoogleSheetsReportRun: { done: false, completedAt: null },
  };
}
