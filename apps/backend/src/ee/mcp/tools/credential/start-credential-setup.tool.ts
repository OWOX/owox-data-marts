import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod';
import { PublicOriginService } from '../../../../common/config/public-origin.service';
import {
  MCP_CREDENTIALS_FACADE,
  type McpCredentialsFacade,
} from '../../../../data-marts/credentials/facades/mcp-credentials.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { CredentialToolMapper } from './credential-tool.mapper';
import { startCredentialSetupSchema, credentialSetupOutputSchema } from './credential.schemas';

type Input = z.infer<typeof startCredentialSetupSchema>;

@Injectable()
export class StartCredentialSetupTool implements McpToolDefinition<Input> {
  readonly name = 'start_credential_setup';
  readonly description =
    'Start authenticated browser setup to create a Credential, replace its secrets or reconnect an account. Use definition_id to create a Credential. Use credential_id to update a Credential. Omit both IDs to select the provider in the browser. For a new Credential, optionally pass title to prefill its name. The user can change this name. Omit title to use the provider or connected account name. Do not pass title with credential_id. Never supply secrets.\n\nThe tool returns an expiring setup_id and a url for the current user and project. The user must sign in with the same OWOX account that connected MCP and remain in the connected project. Use get_credential_setup_status to identify the exact saved Credential. Do not infer completion from the newest list item.';
  readonly zodSchema = startCredentialSetupSchema;
  readonly outputSchema = {
    ...credentialSetupOutputSchema,
    url: z.string(),
    instructions: z.string(),
  };
  readonly annotations = {
    title: 'Set up Credential',
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'viewer';
  private readonly mapper = new CredentialToolMapper();

  constructor(
    @Inject(MCP_CREDENTIALS_FACADE) private readonly credentials: McpCredentialsFacade,
    private readonly publicOrigin: PublicOriginService
  ) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = startCredentialSetupSchema.parse(input);
    const result = await this.credentials.startSetup(this.mapper.toActor(context), {
      definitionId: parsed.definition_id,
      credentialId: parsed.credential_id,
      title: parsed.title,
    });
    return jsonToolResult({
      ...this.mapper.toSetup(result),
      url: this.mapper.toSetupUrl(
        context.projectId,
        result.id,
        this.publicOrigin.getPublicOrigin()
      ),
      instructions:
        'Open this URL. Sign in with the same OWOX account that connected MCP. Complete the Credential form in the connected project. Enter secrets only in that form. Then call get_credential_setup_status with this setup_id. Use wait_seconds to wait up to 25 seconds.\n\nA completed status identifies the saved Credential. This status does not mean that the provider verified it. The tool does not promise a background notification when setup completes.',
    });
  }
}
