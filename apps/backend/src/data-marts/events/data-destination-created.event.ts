import { BaseEvent } from '@owox/internal-helpers';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';

export interface DataDestinationCreatedEventPayload {
  destinationId: string;
  projectId: string;
  createdById: string;
  destinationType: DataDestinationType;
}

export class DataDestinationCreatedEvent extends BaseEvent<DataDestinationCreatedEventPayload> {
  get name() {
    return 'data-destination.created' as const;
  }

  constructor(
    destinationId: string,
    projectId: string,
    createdById: string,
    destinationType: DataDestinationType
  ) {
    super({ destinationId, projectId, createdById, destinationType });
  }
}
