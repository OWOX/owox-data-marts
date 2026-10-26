import type { DataMartIconValue } from '../../enums/data-mart-icon.enum';

export class CreateContextCommand {
  constructor(
    public readonly projectId: string,
    public readonly userId: string,
    public readonly name: string,
    public readonly description?: string | null,
    public readonly icon?: DataMartIconValue | null
  ) {}
}
