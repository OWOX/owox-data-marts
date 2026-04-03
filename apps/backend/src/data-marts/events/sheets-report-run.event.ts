import { BaseEvent } from '@owox/internal-helpers';
import { RunEventStatus } from './run-event-status.type';

export interface SheetsReportRunEventPayload {
  dataMartId: string;
  runId: string;
  biProjectId: string;
  userId: string;
  status: RunEventStatus;
}

export class SheetsReportRunEvent extends BaseEvent<SheetsReportRunEventPayload> {
  get name() {
    return `sheets.report.run.${this.payload.status}` as const;
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
