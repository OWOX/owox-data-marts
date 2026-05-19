import type { ReactNode } from 'react';
import type { User } from '../../../features/idp/types';

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
  HAS_GOOGLE_SHEETS_DESTINATION = 'hasGoogleSheetsDestination',
  HAS_GOOGLE_SHEETS_EXTENSION = 'hasGoogleSheetsExtension',
  HAS_GOOGLE_SHEETS_REPORT_RUN = 'hasGoogleSheetsReportRun',
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
  | { type: StepActionType.LINK; href: string; label: string; openInNewTab?: boolean }
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
  CREATE_GOOGLE_SHEETS_DESTINATION = 'create_google_sheets_destination',
  INSTALL_GOOGLE_SHEETS_EXTENSION = 'install_google_sheets_extension',
  CREATE_RUN_REPORT_FROM_EXTENSION = 'create_run_report_from_extension',
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
  ENABLE_GOOGLE_SHEETS = 'group_enable_google_sheets',
}

export interface SetupGroup {
  id: GroupId;
  title: string;
  description: string;
  stepIds: SetupStepId[];
  isConditional?: boolean;
  showCondition?: (user: User | null) => boolean;
}

export interface GroupProgress {
  group: SetupGroup;
  status: GroupStatus;
  completedCount: number;
  totalCount: number;
  completedAt: string | null;
}
