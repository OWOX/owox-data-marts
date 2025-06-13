import { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';

export class CreateDataStorageCommand {
  constructor(public readonly type: DataStorageType) {}
}
