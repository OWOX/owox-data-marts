import { BaseEvent } from '@owox/internal-helpers';
import { RunEventStatus } from './run-event-status.type';

export interface GoogleChatReportRunEventPayload {
  dataMartId: string;
  runId: string;
  biProjectId: string;
  userId: string;
  status: RunEventStatus;
}

export class GoogleChatReportRunEvent extends BaseEvent<GoogleChatReportRunEventPayload> {
  get name() {
    return `google-chat.report.run.${this.payload.status}` as const;
  }

  constructor(
    dataMartId: string,
    runId: string,
    biProjectId: string,
    userId: string,
    status: RunEventStatus
  ) {
    super({ dataMartId, runId, biProjectId, userId, status });
  }
}
