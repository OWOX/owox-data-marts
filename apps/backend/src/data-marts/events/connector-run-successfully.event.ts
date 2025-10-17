import { BaseEvent } from '@owox/internal-helpers';
import { RunType } from '../../common/scheduler/shared/types';

export interface ConnectorRunSuccessfullyEventPayload {
  dataMartId: string;
  runId: string;
  biProjectId: string;
  userId: string;
  runType: RunType;
}

export class ConnectorRunSuccessfullyEvent extends BaseEvent<ConnectorRunSuccessfullyEventPayload> {
  get name() {
    return 'connector.run.successfully' as const;
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
