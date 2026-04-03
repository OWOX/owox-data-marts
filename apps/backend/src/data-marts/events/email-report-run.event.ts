import { BaseEvent } from '@owox/internal-helpers';
import { RunEventStatus } from './run-event-status.type';

export interface EmailReportRunEventPayload {
  dataMartId: string;
  runId: string;
  biProjectId: string;
  userId: string;
  status: RunEventStatus;
}

export class EmailReportRunEvent extends BaseEvent<EmailReportRunEventPayload> {
  get name() {
    return `email.report.run.${this.payload.status}` as const;
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
