import { BaseEvent } from '@owox/internal-helpers';

export interface LookerReportRunSuccessfullyEventPayload {
  dataMartId: string;
  runId: string;
  biProjectId: string;
  userId: string;
}

export class LookerReportRunSuccessfullyEvent extends BaseEvent<LookerReportRunSuccessfullyEventPayload> {
  get name() {
    return 'looker.report.run.successfully' as const;
  }

  constructor(dataMartId: string, runId: string, biProjectId: string, userId: string) {
    super({ dataMartId, runId, biProjectId, userId });
  }
}
