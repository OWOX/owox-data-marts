import { DataMartIcon } from '../../enums/data-mart-icon.enum';

export class CreateDataMartCommand {
  constructor(
    public readonly projectId: string,
    public readonly userId: string,
    public readonly title: string,
    public readonly storageId: string,
    public readonly roles: string[] = [],
    public readonly icon: DataMartIcon | null = null
  ) {}
}
