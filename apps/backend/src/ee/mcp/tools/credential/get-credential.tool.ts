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
import { credentialTargetSchema, credentialOutputSchema } from './credential.schemas';

type Input = z.infer<typeof credentialTargetSchema>;

@Injectable()
export class GetCredentialTool implements McpToolDefinition<Input> {
  readonly name = 'get_credential';
  readonly description =
    'Read safe metadata for a visible Credential. Use list_credentials to find credential_id. The tool never returns provider secrets, stored field values, validation messages or hidden consumer identities.';
  readonly zodSchema = credentialTargetSchema;
  readonly outputSchema = credentialOutputSchema;
  readonly annotations = {
    title: 'Get Credential',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly requiredRole: Role = 'viewer';
  private readonly mapper = new CredentialToolMapper();

  constructor(@Inject(MCP_CREDENTIALS_FACADE) private readonly credentials: McpCredentialsFacade) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = credentialTargetSchema.parse(input);
    const result = await this.credentials.get(this.mapper.toActor(context), parsed.credential_id);
    return jsonToolResult(this.mapper.toCredential(result));
  }
}
