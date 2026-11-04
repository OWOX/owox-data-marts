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
import { noCredentialInputSchema, credentialListItemSchema } from './credential.schemas';

type Input = z.infer<typeof noCredentialInputSchema>;

@Injectable()
export class ListCredentialsTool implements McpToolDefinition<Input> {
  readonly name = 'list_credentials';
  readonly description =
    'List Credentials visible to the current member in the connected project. The result contains safe metadata, validation state, access settings and visible consumers. Hidden consumers contribute only to hidden_consumer_count. Check can_use before you select a Credential for a consumer.';
  readonly zodSchema = noCredentialInputSchema;
  readonly outputSchema = { credentials: z.array(credentialListItemSchema) };
  readonly annotations = {
    title: 'List Credentials',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly requiredRole: Role = 'viewer';
  private readonly mapper = new CredentialToolMapper();

  constructor(@Inject(MCP_CREDENTIALS_FACADE) private readonly credentials: McpCredentialsFacade) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    noCredentialInputSchema.parse(input);
    const result = await this.credentials.list(this.mapper.toActor(context));
    return jsonToolResult({ credentials: result.map(dto => this.mapper.toListItem(dto)) });
  }
}
