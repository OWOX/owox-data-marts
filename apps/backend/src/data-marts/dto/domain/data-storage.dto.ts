import { DataStorageType } from '../../enums/data-storage-type.enum';

export class DataStorageDto {
  constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly type: DataStorageType,
    public readonly projectId: string,
    public readonly credentials: Record<string, unknown> | undefined,
    public readonly config: Record<string, unknown> | undefined,
    public readonly createdAt: Date,
    public readonly modifiedAt: Date
  ) {}
}
