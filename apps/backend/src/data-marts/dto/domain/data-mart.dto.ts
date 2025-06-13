import { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';

export class DataMartDto {
  constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly storageType: DataStorageType,
    public readonly createdAt: Date,
    public readonly modifiedAt: Date
  ) {}
}
