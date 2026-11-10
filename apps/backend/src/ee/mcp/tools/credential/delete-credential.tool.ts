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
import { credentialTargetSchema } from './credential.schemas';

type Input = z.infer<typeof credentialTargetSchema>;

@Injectable()
export class DeleteCredentialTool implements McpToolDefinition<Input> {
  readonly name = 'delete_credential';
  readonly description =
    "Delete an unused Credential. You must have delete access. The tool refuses to delete a Credential with active consumers, including hidden consumers. First, inspect the Credential with get_credential. Ask the user to remove bindings in OWOX before you retry deletion. Never delete consumers to bypass this restriction. Get the user's approval before the call.";
  readonly zodSchema = credentialTargetSchema;
  readonly outputSchema = { credential_id: z.string(), status: z.literal('deleted') };
  readonly annotations = {
    title: 'Delete Credential',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'viewer';
  private readonly mapper = new CredentialToolMapper();

  constructor(@Inject(MCP_CREDENTIALS_FACADE) private readonly credentials: McpCredentialsFacade) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = credentialTargetSchema.parse(input);
    await this.credentials.delete(this.mapper.toActor(context), parsed.credential_id);
    return jsonToolResult({ credential_id: parsed.credential_id, status: 'deleted' });
  }
}
