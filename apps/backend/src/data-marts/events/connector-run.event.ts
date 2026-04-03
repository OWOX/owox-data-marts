import { BaseEvent } from '@owox/internal-helpers';
import { RunType } from '../../common/scheduler/shared/types';
import { RunEventStatus } from './run-event-status.type';

export interface ConnectorRunEventPayload {
  dataMartId: string;
  runId: string;
  biProjectId: string;
  userId: string;
  runType: RunType;
  status: RunEventStatus;
}

export class ConnectorRunEvent extends BaseEvent<ConnectorRunEventPayload> {
  get name() {
    return `connector.run.${this.payload.status}` as const;
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
