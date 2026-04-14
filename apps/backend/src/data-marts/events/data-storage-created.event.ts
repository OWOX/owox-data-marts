import { BaseEvent } from '@owox/internal-helpers';

export interface DataStorageCreatedEventPayload {
  storageId: string;
  projectId: string;
  createdById: string;
}

export class DataStorageCreatedEvent extends BaseEvent<DataStorageCreatedEventPayload> {
  get name() {
    return 'data-storage.created' as const;
  }

  constructor(storageId: string, projectId: string, createdById: string) {
    super({ storageId, projectId, createdById });
  }
}
