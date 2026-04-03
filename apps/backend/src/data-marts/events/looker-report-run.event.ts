import { BaseEvent } from '@owox/internal-helpers';
import { RunEventStatus } from './run-event-status.type';

export interface LookerReportRunEventPayload {
  dataMartId: string;
  runId: string;
  biProjectId: string;
  userId: string;
  status: RunEventStatus;
}

export class LookerReportRunEvent extends BaseEvent<LookerReportRunEventPayload> {
  get name() {
    return `looker.report.run.${this.payload.status}` as const;
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
