import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod';
import {
  MCP_CONNECTORS_FACADE,
  type McpConnectorsFacade,
} from '../../../../data-marts/facades/mcp-connectors.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { connectorFieldOptionsPreviewSchema } from './connector.schemas';

const inputSchema = connectorFieldOptionsPreviewSchema;
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class PreviewConnectorFieldOptionsTool implements McpToolDefinition<Input> {
  readonly name = 'preview_connector_field_options';
  readonly description =
    'Read the available values for a parameter marked DYNAMIC_OPTIONS from a bundled connector source. Supply its non-secret dependencies and an optional saved Credential. The tool requires editor access and write scope. It does not save configuration or grant source permissions.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = { options: z.array(z.object({ value: z.string(), label: z.string() })) };
  readonly annotations = {
    title: 'Preview connector field options',
    readOnlyHint: false,
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
      options: await this.connectors.previewFieldOptions(actor, {
        connectorName: parsed.connector_name,
        configuration: parsed.configuration,
        credentialId: parsed.credential_id,
        dataMartId: parsed.data_mart_id,
        configurationId: parsed.configuration_id,
        field: parsed.field,
      }),
    });
  }
}
