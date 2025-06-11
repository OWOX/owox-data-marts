import { DataStorageType } from '../../enums/data-storage-type.enum';

export class CreateDataMartCommand {
  constructor(
    public readonly title: string,
    public readonly title2: any,
    public readonly title3: any,
    public readonly storage: DataStorageType
  ) {}
}
