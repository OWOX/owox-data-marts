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
export class ConsentCredentialDefinitionTool implements McpToolDefinition<Input> {
  readonly name = 'consent_credential_definition';
  readonly description =
    'Accept the current external provider definition for an existing Credential. You must have edit access. First, use get_credential to inspect definition_consent_required and compatibility_line. Confirm the provider change with the user before you accept it.';
  readonly zodSchema = credentialTargetSchema;
  readonly outputSchema = credentialOutputSchema;
  readonly annotations = {
    title: 'Consent to Credential definition',
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'viewer';
  private readonly mapper = new CredentialToolMapper();

  constructor(@Inject(MCP_CREDENTIALS_FACADE) private readonly credentials: McpCredentialsFacade) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = credentialTargetSchema.parse(input);
    const result = await this.credentials.consentDefinition(
      this.mapper.toActor(context),
      parsed.credential_id
    );
    return jsonToolResult(this.mapper.toCredential(result));
  }
}
