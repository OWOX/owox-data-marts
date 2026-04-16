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

export enum ProgressKey {
  HAS_STORAGE = 'hasStorage',
  HAS_DRAFT_DATA_MART = 'hasDraftDataMart',
  HAS_PUBLISHED_DATA_MART = 'hasPublishedDataMart',
  HAS_DESTINATION = 'hasDestination',
  HAS_REPORT = 'hasReport',
  HAS_REPORT_RUN = 'hasReportRun',
  HAS_TEAMMATES_INVITED = 'hasTeammatesInvited',
}

export type ProjectSetupProgress = Record<ProgressKey, SetupStepProgress>;

export enum StepActionType {
  LINK = 'link',
  COMPONENT = 'component',
}

export interface StepActionRenderContext {
  onClick: () => void;
}

export type StepAction =
  | { type: StepActionType.LINK; href: string; label: string }
  | {
      type: StepActionType.COMPONENT;
      label?: string;
      render: (props: StepActionRenderContext) => ReactNode;
    };

export enum SetupStepId {
  CREATE_STORAGE = 'create_storage',
  CREATE_DATA_MART = 'create_data_mart',
  PUBLISH_DATA_MART = 'publish_data_mart',
  CREATE_DESTINATION = 'create_destination',
  CREATE_REPORT = 'create_report',
  REPORT_RUN = 'report_run',
  INVITE_TEAMMATES = 'invite_teammates',
}

export interface SetupStep {
  id: SetupStepId;
  stepTitle: string;
  stepDescription: string;
  successMessage: string;
  action: StepAction;
  progressKey: ProgressKey;
}

export enum GroupStatusType {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
}

export type GroupStatus = GroupStatusType;

export enum GroupId {
  STORAGE = 'group_storage',
  PUBLISH = 'group_publish',
  REPORT = 'group_report',
  INVITE_TEAMMATES = 'group_invite_teammates',
}

export interface SetupGroup {
  id: GroupId;
  title: string;
  description: string;
  stepIds: SetupStepId[];
}

export interface GroupProgress {
  group: SetupGroup;
  status: GroupStatus;
  completedCount: number;
  totalCount: number;
  completedAt: string | null;
}
