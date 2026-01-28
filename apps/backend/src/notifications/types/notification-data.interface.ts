export interface RunNotificationData {
  projectId: string;
  projectTitle: string;
  dataMartId: string;
  dataMartTitle: string;
  runId: string;
  runStatus: 'FAILED' | 'SUCCESSFUL';
  creatorUserId?: string;
  errors?: string[];
  rowsProcessed?: number;
  durationMs?: number;
  startedAt?: string;
  finishedAt?: string;
}

export interface CreditsLimitNotificationData {
  projectId: string;
  projectTitle: string;
  creditsUsed: number;
  creditsLimit: number;
}

export interface BatchedRunNotificationData {
  projectId: string;
  projectTitle: string;
  runs: RunNotificationData[];
}

export type NotificationData =
  | RunNotificationData
  | CreditsLimitNotificationData
  | BatchedRunNotificationData;

export interface WebhookDataMart {
  id: string;
  title: string;
  url: string;
}

export interface WebhookRun {
  id: string;
  status: 'FAILED' | 'SUCCESSFUL';
  type?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  rowsProcessed?: number;
  errors?: string[];
}

export interface WebhookPayload {
  id: string;
  version: '1';
  event: string;
  timestamp: string;
  isTest?: boolean;
  data: {
    projectId: string;
    projectTitle?: string;
    dataMart: WebhookDataMart;
    run: WebhookRun;
  };
}
