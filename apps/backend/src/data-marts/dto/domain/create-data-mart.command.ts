import { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';

export class CreateDataMartCommand {
  constructor(
    public readonly title: string,
    public readonly storage: DataStorageType
  ) {}
}
