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
export class ValidateCredentialTool implements McpToolDefinition<Input> {
  readonly name = 'validate_credential';
  readonly description =
    'Validate a stored Credential through its provider. The tool returns validation_state. You must have edit access to the Credential. The tool sends a request to the provider and may refresh a stored OAuth grant. The result omits raw provider messages and secret values.';
  readonly zodSchema = credentialTargetSchema;
  readonly outputSchema = credentialOutputSchema;
  readonly annotations = {
    title: 'Validate Credential',
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: true,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'viewer';
  private readonly mapper = new CredentialToolMapper();

  constructor(@Inject(MCP_CREDENTIALS_FACADE) private readonly credentials: McpCredentialsFacade) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = credentialTargetSchema.parse(input);
    const result = await this.credentials.validate(
      this.mapper.toActor(context),
      parsed.credential_id
    );
    return jsonToolResult(this.mapper.toCredential(result));
  }
}
