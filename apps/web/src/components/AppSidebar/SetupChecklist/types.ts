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
  popoverTitle: string;
  popoverDescription: string;
  ctaLabel: string;
  successTitle: string;
  successDescription: string;
  linkPath: string | ReactNode;
  progressKey: SetupStepKey;
}

export type GroupStatus = 'not_started' | 'in_progress' | 'done';

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
