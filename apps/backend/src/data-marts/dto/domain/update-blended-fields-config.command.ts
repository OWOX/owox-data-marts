import { BlendedFieldsConfig } from '../schemas/blended-fields-config.schemas';

export class UpdateBlendedFieldsConfigCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly blendedFieldsConfig: BlendedFieldsConfig | null,
    public readonly userId: string,
    public readonly roles: string[]
  ) {}
}
