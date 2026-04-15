import { BaseEvent } from '@owox/internal-helpers';

export interface ReportRunCompletedSuccessfullyEventPayload {
  dataMartRunId: string;
  dataMartId: string;
  /** Owner of the run — used to mark user-scoped checklist steps. */
  userId: string;
}

export class ReportRunCompletedSuccessfullyEvent extends BaseEvent<ReportRunCompletedSuccessfullyEventPayload> {
  get name() {
    return 'report-run.completed.successfully' as const;
  }

  constructor(dataMartRunId: string, dataMartId: string, userId: string) {
    super({ dataMartRunId, dataMartId, userId });
  }
}
