import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_CUSTOM_CONNECTORS_FACADE,
  type McpCustomConnectorsFacade,
} from '../../../../data-marts/facades/mcp-custom-connectors.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { updateConnectorSchema, connectorDetailOutputSchema } from './custom-connector.schemas';
import { CustomConnectorToolMapper } from './custom-connector-tool.mapper';

const inputSchema = updateConnectorSchema;
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class UpdateCustomConnectorTool implements McpToolDefinition<Input> {
  readonly name = 'update_custom_connector';
  readonly description =
    'Update the title, description, logo or documentation URL of a custom connector. You must be an editor. Omitted fields remain unchanged. Use null to clear description, logo or doc_url. The connector name cannot change.\n\nUse save_custom_connector_draft to edit the manifest. Publishing or activating a version can update display metadata from that manifest.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = connectorDetailOutputSchema;
  readonly annotations = {
    title: 'Update custom connector metadata',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'editor';
  private readonly mapper = new CustomConnectorToolMapper();

  constructor(
    @Inject(MCP_CUSTOM_CONNECTORS_FACADE) private readonly connectors: McpCustomConnectorsFacade
  ) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = inputSchema.parse(input);
    const result = await this.connectors.updateMetadata(context.projectId, parsed.connector_id, {
      title: parsed.title,
      description: parsed.description,
      logo: parsed.logo,
      docUrl: parsed.doc_url,
    });
    return jsonToolResult(this.mapper.toDetail(result));
  }
}
