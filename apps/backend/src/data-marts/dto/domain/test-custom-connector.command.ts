import type { CustomConnectorTestInput } from './custom-connector.dto';

/** A test on a Credential's values; the Credential access check needs the caller. */
export interface TestCustomConnectorCredential {
  credentialId: string;
  userId: string;
  roles: string[];
}

export class TestCustomConnectorCommand {
  constructor(
    public readonly projectId: string,
    public readonly input: CustomConnectorTestInput,
    public readonly credential?: TestCustomConnectorCredential
  ) {}
}
