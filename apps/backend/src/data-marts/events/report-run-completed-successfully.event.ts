import { BaseEvent } from '@owox/internal-helpers';
import type { DataMartRunType } from '../enums/data-mart-run-type.enum';

export interface ReportRunCompletedSuccessfullyEventPayload {
  dataMartRunId: string;
  dataMartId: string;
  /** Owner of the run — used to mark user-scoped checklist steps. */
  userId: string;
  runType: DataMartRunType;
}

export class ReportRunCompletedSuccessfullyEvent extends BaseEvent<ReportRunCompletedSuccessfullyEventPayload> {
  get name() {
    return 'report-run.completed.successfully' as const;
  }

  constructor(dataMartRunId: string, dataMartId: string, userId: string, runType: DataMartRunType) {
    super({ dataMartRunId, dataMartId, userId, runType });
  }
}
