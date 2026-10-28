import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_CUSTOM_CONNECTORS_FACADE,
  type McpCustomConnectorsFacade,
} from '../../../../data-marts/facades/mcp-custom-connectors.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { saveDraftSchema, versionStateOutputSchema } from './custom-connector.schemas';

const inputSchema = saveDraftSchema;
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class SaveCustomConnectorDraftTool implements McpToolDefinition<Input> {
  readonly name = 'save_custom_connector_draft';
  readonly description =
    "Replace the complete current draft manifest, or create the next draft if none exists. You must be an editor. Send the complete manifest, not a patch. Published versions cannot change. The active version stays active until publish_custom_connector or activate_custom_connector_version selects another version. Read the latest draft before editing to avoid overwriting another author's changes.";
  readonly zodSchema = inputSchema;
  readonly outputSchema = versionStateOutputSchema;
  readonly annotations = {
    title: 'Save custom connector draft',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'editor';

  constructor(
    @Inject(MCP_CUSTOM_CONNECTORS_FACADE) private readonly connectors: McpCustomConnectorsFacade
  ) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = inputSchema.parse(input);
    const result = await this.connectors.saveDraft(
      context.projectId,
      parsed.connector_id,
      parsed.manifest
    );
    return jsonToolResult({ version: result.version, status: result.status });
  }
}
