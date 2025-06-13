import { DataStorageConfig } from '../../data-storage-types/data-storage-config.type';

export class UpdateDataStorageCommand {
  constructor(
    public readonly credentials: Record<string, unknown>,
    public readonly config: DataStorageConfig
  ) {}
}
