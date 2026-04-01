import { BaseEvent } from '@owox/internal-helpers';
import { DataMartStatus } from '../enums/data-mart-status.enum';

export interface DataMartPublishedEventPayload {
  dataMartId: string;
  projectId: string;
  createdById: string;
  previousStatus: DataMartStatus;
}

export class DataMartPublishedEvent extends BaseEvent<DataMartPublishedEventPayload> {
  get name() {
    return 'data-mart.published' as const;
  }

  constructor(
    dataMartId: string,
    projectId: string,
    createdById: string,
    previousStatus: DataMartStatus
  ) {
    super({ dataMartId, projectId, createdById, previousStatus });
  }
}
