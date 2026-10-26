import { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';

export class ListDataStoragesByTypeCommand {
  constructor(
    public readonly projectId: string,
    public readonly type: DataStorageType,
    public readonly userId: string = '',
    public readonly roles: string[] = [],
    public readonly isPluginCall: boolean = false
  ) {}
}
