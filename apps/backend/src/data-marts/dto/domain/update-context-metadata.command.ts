import type { DataMartIconValue } from '../../enums/data-mart-icon.enum';

export class UpdateContextMetadataCommand {
  constructor(
    public readonly contextId: string,
    public readonly projectId: string,
    public readonly name?: string,
    public readonly description?: string | null,
    public readonly icon?: DataMartIconValue | null
  ) {}
}
