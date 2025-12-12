import { BaseEvent } from '@owox/internal-helpers';

export interface MsTeamsReportRunSuccessfullyEventPayload {
  dataMartId: string;
  runId: string;
  biProjectId: string;
  userId: string;
}

export class MsTeamsReportRunSuccessfullyEvent extends BaseEvent<MsTeamsReportRunSuccessfullyEventPayload> {
  get name() {
    return 'ms-teams.report.run.successfully' as const;
  }

  constructor(dataMartId: string, runId: string, biProjectId: string, userId: string) {
    super({ dataMartId, runId, biProjectId, userId });
  }
}
