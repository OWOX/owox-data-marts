import { BaseEvent } from '@owox/internal-helpers';
import { RunType } from '../../common/scheduler/shared/types';
import { RunEventStatus } from './run-event-status.type';

export interface InsightRunEventPayload {
  dataMartId: string;
  runId: string;
  biProjectId: string;
  userId: string;
  runType: RunType;
  status: RunEventStatus;
}

export class InsightRunEvent extends BaseEvent<InsightRunEventPayload> {
  get name() {
    return `insight.run.${this.payload.status}` as const;
  }

  constructor(
    dataMartId: string,
    runId: string,
    biProjectId: string,
    userId: string,
    runType: RunType,
    status: RunEventStatus
  ) {
    super({ dataMartId, runId, biProjectId, userId, runType, status });
  }
}
