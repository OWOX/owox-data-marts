import { DataMartIcon } from '../../enums/data-mart-icon.enum';

export class UpdateDataMartIconCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly icon: DataMartIcon | null,
    public readonly userId: string = '',
    public readonly roles: string[] = []
  ) {}
}
