import type { CustomConnectorTestInput } from './custom-connector.dto';

export class TestCustomConnectorCommand {
  constructor(
    public readonly projectId: string,
    public readonly input: CustomConnectorTestInput
  ) {}
}
