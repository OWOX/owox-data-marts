import { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';
import { DataStorageConfig } from '../../data-storage-types/data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-types/data-storage-credentials.type';

export class DataStorageDto {
  constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly type: DataStorageType,
    public readonly projectId: string,
    public readonly credentials: DataStorageCredentials | undefined,
    public readonly config: DataStorageConfig | undefined,
    public readonly createdAt: Date,
    public readonly modifiedAt: Date,
    public readonly dataMartsCount: number = 0,
    public readonly draftsCount: number = 0
  ) {}
}
