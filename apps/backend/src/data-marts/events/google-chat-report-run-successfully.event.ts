import { BaseEvent } from '@owox/internal-helpers';

export interface GoogleChatReportRunSuccessfullyEventPayload {
  dataMartId: string;
  runId: string;
  biProjectId: string;
  userId: string;
}

export class GoogleChatReportRunSuccessfullyEvent extends BaseEvent<GoogleChatReportRunSuccessfullyEventPayload> {
  get name() {
    return 'google-chat.report.run.successfully' as const;
  }

  constructor(dataMartId: string, runId: string, biProjectId: string, userId: string) {
    super({ dataMartId, runId, biProjectId, userId });
  }
}
