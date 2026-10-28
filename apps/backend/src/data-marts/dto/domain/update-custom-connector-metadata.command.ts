import type { CustomConnectorMetadataInput } from './custom-connector.dto';

export class UpdateCustomConnectorMetadataCommand {
  constructor(
    public readonly projectId: string,
    public readonly connectorId: string,
    public readonly input: CustomConnectorMetadataInput
  ) {}
}
