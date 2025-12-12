import { BaseEvent } from '@owox/internal-helpers';

export interface EmailReportRunSuccessfullyEventPayload {
  dataMartId: string;
  runId: string;
  biProjectId: string;
  userId: string;
}

export class EmailReportRunSuccessfullyEvent extends BaseEvent<EmailReportRunSuccessfullyEventPayload> {
  get name() {
    return 'email.report.run.successfully' as const;
  }

  constructor(dataMartId: string, runId: string, biProjectId: string, userId: string) {
    super({ dataMartId, runId, biProjectId, userId });
  }
}
