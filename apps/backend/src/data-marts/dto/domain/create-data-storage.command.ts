import { DataStorageType } from '../../enums/data-storage-type.enum';

export class CreateDataStorageCommand {
  constructor(public readonly type: DataStorageType) {}
}
