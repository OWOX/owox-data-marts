import type { AuthorizationContext } from '../../../idp';
import type { CredentialSetupDto } from '../dto/credential-setup.dto';
import type {
  McpCredentialDefinitionDto,
  McpCredentialDto,
  McpStartCredentialSetupInput,
  McpUnavailableCredentialDto,
  McpUpdateCredentialInput,
} from '../dto/mcp-credential.dto';

export type {
  McpCredentialDefinitionDto,
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
  list(actor: AuthorizationContext): Promise<(McpCredentialDto | McpUnavailableCredentialDto)[]>;
  get(actor: AuthorizationContext, id: string): Promise<McpCredentialDto>;
  update(
    actor: AuthorizationContext,
    id: string,
    input: McpUpdateCredentialInput
  ): Promise<McpCredentialDto>;
  validate(actor: AuthorizationContext, id: string): Promise<McpCredentialDto>;
  consentDefinition(actor: AuthorizationContext, id: string): Promise<McpCredentialDto>;
  delete(actor: AuthorizationContext, id: string): Promise<void>;
  startSetup(
    actor: AuthorizationContext,
    input: McpStartCredentialSetupInput
  ): Promise<CredentialSetupDto>;
  getSetupStatus(
    actor: AuthorizationContext,
    id: string,
    waitSeconds?: number,
    signal?: AbortSignal
  ): Promise<CredentialSetupDto>;
}
