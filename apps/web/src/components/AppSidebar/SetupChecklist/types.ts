import type { ReactNode } from 'react';

export interface ProjectSetupResponse {
  version: number;
  progress: number;
  stepsSchemaVersion: number;
  steps: ProjectSetupProgress;
}

export interface SetupStepProgress {
  done: boolean;
  completedAt: string | null;
}

export interface ProjectSetupProgress {
  hasStorage: SetupStepProgress;
  hasDraftDataMart: SetupStepProgress;
  hasPublishedDataMart: SetupStepProgress;
  hasDestination: SetupStepProgress;
  hasReport: SetupStepProgress;
  hasReportRun: SetupStepProgress;
  hasTeammatesInvited: SetupStepProgress;
}

export type SetupStepKey = keyof ProjectSetupProgress;

export interface SetupStep {
  id: string;
  label: string;
  stepTitle: string;
  stepDescription: string;
  ctaLabel: string;
  successMessageTitle: string;
  successMessageDescription?: string;
  linkPath: string | ReactNode;
  progressKey: SetupStepKey;
}

export enum GroupStatusType {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
}

export type GroupStatus =
  | GroupStatusType.NOT_STARTED
  | GroupStatusType.IN_PROGRESS
  | GroupStatusType.DONE;

export interface SetupGroup {
  id: string;
  title: string;
  description: string;
  stepIds: string[];
}

export interface GroupProgress {
  group: SetupGroup;
  status: GroupStatus;
  completedCount: number;
  totalCount: number;
  completedAt: string | null;
}
