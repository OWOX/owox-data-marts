import { BaseEvent } from '@owox/internal-helpers';
import { RunType } from '../../common/scheduler/shared/types';

export interface InsightRunSuccessfullyEventPayload {
  dataMartId: string;
  runId: string;
  biProjectId: string;
  userId: string;
  runType: RunType;
}

export class InsightRunSuccessfullyEvent extends BaseEvent<InsightRunSuccessfullyEventPayload> {
  get name() {
    return 'insight.run.successfully' as const;
  }

  constructor(
    dataMartId: string,
    runId: string,
    biProjectId: string,
    userId: string,
    runType: RunType
  ) {
    super({ dataMartId, runId, biProjectId, userId, runType });
  }
}
