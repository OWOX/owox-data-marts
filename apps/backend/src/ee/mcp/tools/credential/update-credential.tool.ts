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
import { updateCredentialSchema, credentialOutputSchema } from './credential.schemas';

type Input = z.infer<typeof updateCredentialSchema>;

@Injectable()
export class UpdateCredentialTool implements McpToolDefinition<Input> {
  readonly name = 'update_credential';
  readonly description =
    'Update the Credential title, enabled state, owners, Contexts, sharing or AI model mappings. Omitted fields stay unchanged. owner_ids and context_ids replace their complete lists: keep the existing entries that the user still needs. Disabling the Credential can stop dependent runs. Changing owners, Contexts or sharing can revoke existing access. Existing permissions to edit, manage owners and configure sharing apply to the supplied fields.\n\nNever send provider secrets, field values or OAuth tokens. Use start_credential_setup to replace secrets or reconnect an account.';
  readonly zodSchema = updateCredentialSchema;
  readonly outputSchema = credentialOutputSchema;
  readonly annotations = {
    title: 'Update Credential',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'viewer';
  private readonly mapper = new CredentialToolMapper();

  constructor(@Inject(MCP_CREDENTIALS_FACADE) private readonly credentials: McpCredentialsFacade) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = updateCredentialSchema.parse(input);
    const result = await this.credentials.update(
      this.mapper.toActor(context),
      parsed.credential_id,
      {
        title: parsed.title,
        ownerIds: parsed.owner_ids,
        contextIds: parsed.context_ids,
        enabled: parsed.enabled,
        availableForUse: parsed.available_for_use,
        availableForMaintenance: parsed.available_for_maintenance,
        aiModelMappings: parsed.ai_model_mappings,
        aiModelMappingModes: parsed.ai_model_mapping_modes,
      }
    );
    return jsonToolResult(this.mapper.toCredential(result));
  }
}
