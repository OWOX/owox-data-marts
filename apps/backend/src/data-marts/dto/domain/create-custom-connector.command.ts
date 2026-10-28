import type { CreateCustomConnectorInput } from './custom-connector.dto';

export class CreateCustomConnectorCommand {
  constructor(
    public readonly projectId: string,
    public readonly userId: string,
    public readonly input: CreateCustomConnectorInput
  ) {}
}
