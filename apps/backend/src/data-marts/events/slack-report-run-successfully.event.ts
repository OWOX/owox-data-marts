import { BaseEvent } from '@owox/internal-helpers';

export interface SlackReportRunSuccessfullyEventPayload {
  dataMartId: string;
  runId: string;
  biProjectId: string;
  userId: string;
}

export class SlackReportRunSuccessfullyEvent extends BaseEvent<SlackReportRunSuccessfullyEventPayload> {
  get name() {
    return 'slack.report.run.successfully' as const;
  }

  constructor(dataMartId: string, runId: string, biProjectId: string, userId: string) {
    super({ dataMartId, runId, biProjectId, userId });
  }
}
