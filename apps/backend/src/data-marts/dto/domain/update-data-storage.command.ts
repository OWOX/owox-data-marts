import { DataStorageConfig } from '../../data-storage-types/data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-types/data-storage-credentials.type';

export class UpdateDataStorageCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly credentials: DataStorageCredentials,
    public readonly config: DataStorageConfig,
    public readonly title: string
  ) {}
}
