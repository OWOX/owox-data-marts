import { BaseEvent } from '@owox/internal-helpers';

export interface StorageConfigSetEventPayload {
  storageId: string;
  projectId: string;
  createdById: string;
}

export class StorageConfigSetEvent extends BaseEvent<StorageConfigSetEventPayload> {
  get name() {
    return 'storage.config.set' as const;
  }

  constructor(storageId: string, projectId: string, createdById: string) {
    super({ storageId, projectId, createdById });
  }
}
