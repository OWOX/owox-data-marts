import { BaseEvent } from '@owox/internal-helpers';

export interface DataMartCreatedEventPayload {
  dataMartId: string;
  projectId: string;
  createdById: string;
}

export class DataMartCreatedEvent extends BaseEvent<DataMartCreatedEventPayload> {
  get name() {
    return 'data-mart.created' as const;
  }

  constructor(dataMartId: string, projectId: string, createdById: string) {
    super({ dataMartId, projectId, createdById });
  }
}
