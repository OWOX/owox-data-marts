import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod';
import {
  MCP_CONNECTORS_FACADE,
  type McpConnectorsFacade,
} from '../../../../data-marts/facades/mcp-connectors.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { connectorPreviewSchema, fieldsOutputSchema } from './connector.schemas';

const inputSchema = connectorPreviewSchema;
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class PreviewConnectorFieldsTool implements McpToolDefinition<Input> {
  readonly name = 'preview_connector_fields';
  readonly description =
    'Read current fields from a bundled connector source with non-secret parameters and an optional saved Credential. The tool requires editor access and write scope. It does not save configuration. Google OAuth access and spreadsheet permissions must already be granted through the web app.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = fieldsOutputSchema;
  readonly annotations = {
    title: 'Preview connector fields',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'editor';

  constructor(@Inject(MCP_CONNECTORS_FACADE) private readonly connectors: McpConnectorsFacade) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = inputSchema.parse(input);
    const actor = { projectId: context.projectId, userId: context.userId, roles: context.roles };
    return jsonToolResult({
      fields: await this.connectors.previewFields(actor, {
        connectorName: parsed.connector_name,
        configuration: parsed.configuration,
        credentialId: parsed.credential_id,
        dataMartId: parsed.data_mart_id,
        configurationId: parsed.configuration_id,
      }),
    });
  }
}
