import { BaseEvent } from '@owox/internal-helpers';

export interface DataDestinationCreatedEventPayload {
  destinationId: string;
  projectId: string;
  createdById: string;
}

export class DataDestinationCreatedEvent extends BaseEvent<DataDestinationCreatedEventPayload> {
  get name() {
    return 'data-destination.created' as const;
  }

  constructor(destinationId: string, projectId: string, createdById: string) {
    super({ destinationId, projectId, createdById });
  }
}
