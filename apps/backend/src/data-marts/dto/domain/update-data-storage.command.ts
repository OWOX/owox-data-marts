import { DataStorageConfig } from '../../data-storage-types/data-storage-config.type';

export class UpdateDataStorageCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly credentials: Record<string, unknown>,
    public readonly config: DataStorageConfig,
    public readonly title: string
  ) {}
}
