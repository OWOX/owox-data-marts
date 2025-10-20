import { BaseEvent } from '@owox/internal-helpers';

export interface SheetsReportRunSuccessfullyEventPayload {
  dataMartId: string;
  runId: string;
  biProjectId: string;
  userId: string;
}

export class SheetsReportRunSuccessfullyEvent extends BaseEvent<SheetsReportRunSuccessfullyEventPayload> {
  get name() {
    return 'sheets.report.run.successfully' as const;
  }

  constructor(dataMartId: string, runId: string, biProjectId: string, userId: string) {
    super({ dataMartId, runId, biProjectId, userId });
  }
}
