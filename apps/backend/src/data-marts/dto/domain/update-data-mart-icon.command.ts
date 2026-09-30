import type { DataMartIconValue } from '../../enums/data-mart-icon.enum';

export class UpdateDataMartIconCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly icon: DataMartIconValue | null,
    public readonly userId: string = '',
    public readonly roles: string[] = []
  ) {}
}
