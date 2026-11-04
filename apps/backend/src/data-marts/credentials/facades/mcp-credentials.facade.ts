import type { CredentialSetupDto } from '../dto/credential-setup.dto';
import type {
  McpCredentialDefinitionDto,
  McpCredentialsActor,
  McpCredentialDto,
  McpStartCredentialSetupInput,
  McpUnavailableCredentialDto,
  McpUpdateCredentialInput,
} from '../dto/mcp-credential.dto';

export type {
  McpCredentialDefinitionDto,
  McpCredentialsActor,
  McpCredentialDto,
  McpStartCredentialSetupInput,
  McpUnavailableCredentialDto,
  McpUpdateCredentialInput,
} from '../dto/mcp-credential.dto';
export type { CredentialSetupDto } from '../dto/credential-setup.dto';
export { GOOGLE_SHEETS_OAUTH_DEFINITION_ID } from '../services/builtin-credential-definitions';

export const MCP_CREDENTIALS_FACADE = Symbol('MCP_CREDENTIALS_FACADE');

export interface McpCredentialsFacade {
  listDefinitions(): Promise<McpCredentialDefinitionDto[]>;
  list(actor: McpCredentialsActor): Promise<(McpCredentialDto | McpUnavailableCredentialDto)[]>;
  get(actor: McpCredentialsActor, id: string): Promise<McpCredentialDto>;
  update(
    actor: McpCredentialsActor,
    id: string,
    input: McpUpdateCredentialInput
  ): Promise<McpCredentialDto>;
  validate(actor: McpCredentialsActor, id: string): Promise<McpCredentialDto>;
  consentDefinition(actor: McpCredentialsActor, id: string): Promise<McpCredentialDto>;
  delete(actor: McpCredentialsActor, id: string): Promise<void>;
  startSetup(
    actor: McpCredentialsActor,
    input: McpStartCredentialSetupInput
  ): Promise<CredentialSetupDto>;
  getSetupStatus(
    actor: McpCredentialsActor,
    id: string,
    waitSeconds?: number,
    signal?: AbortSignal
  ): Promise<CredentialSetupDto>;
}
