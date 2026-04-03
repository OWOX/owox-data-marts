import { BaseEvent } from '@owox/internal-helpers';
import { RunEventStatus } from './run-event-status.type';

export interface MsTeamsReportRunEventPayload {
  dataMartId: string;
  runId: string;
  biProjectId: string;
  userId: string;
  status: RunEventStatus;
}

export class MsTeamsReportRunEvent extends BaseEvent<MsTeamsReportRunEventPayload> {
  get name() {
    return `ms-teams.report.run.${this.payload.status}` as const;
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
