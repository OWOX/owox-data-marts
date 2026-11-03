import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod';
import {
  MCP_CREDENTIALS_FACADE,
  type McpCredentialsFacade,
} from '../../../../data-marts/credentials/facades/mcp-credentials.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { CredentialToolMapper } from './credential-tool.mapper';
import { credentialSetupStatusSchema, credentialSetupOutputSchema } from './credential.schemas';

type Input = z.infer<typeof credentialSetupStatusSchema>;

@Injectable()
export class GetCredentialSetupStatusTool implements McpToolDefinition<Input> {
  readonly name = 'get_credential_setup_status';
  readonly description =
    "Read the current user's Credential setup request in the connected project. The optional wait_seconds parameter waits up to 25 seconds for a terminal status. The wait stops if the client cancels the call. Status is pending, completed, cancelled or expired. If the status is completed, use the returned credential_id.\n\nPending setup expires after 15 minutes. The scheduler removes all requests after 30 minutes from creation, regardless of status. Removed requests return a not-found error. Check existing Credentials before you start another setup if the request is missing.\n\nCompletion means that the user finished the form. Until cleanup, a completed request remains completed if the Credential is deleted or access changes. Use get_credential to check current access. Use get_credential or validate_credential to check provider validation. Repeat this call while the status is pending if you need to wait. The tool does not guarantee background notifications.";
  readonly zodSchema = credentialSetupStatusSchema;
  readonly outputSchema = credentialSetupOutputSchema;
  readonly annotations = {
    title: 'Get Credential setup status',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly requiredRole: Role = 'viewer';
  private readonly mapper = new CredentialToolMapper();

  constructor(@Inject(MCP_CREDENTIALS_FACADE) private readonly credentials: McpCredentialsFacade) {}

  async handler(
    input: Input,
    context: McpAuthContext,
    signal?: AbortSignal
  ): Promise<McpToolResult> {
    const parsed = credentialSetupStatusSchema.parse(input);
    const result = await this.credentials.getSetupStatus(
      this.mapper.toActor(context),
      parsed.setup_id,
      parsed.wait_seconds ?? 0,
      signal
    );
    return jsonToolResult(this.mapper.toSetup(result));
  }
}
