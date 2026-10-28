import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_CUSTOM_CONNECTORS_FACADE,
  type McpCustomConnectorsFacade,
} from '../../../../data-marts/facades/mcp-custom-connectors.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import {
  connectorVersionTargetSchema,
  versionStateOutputSchema,
  jsonObjectSchema,
} from './custom-connector.schemas';

const inputSchema = connectorVersionTargetSchema;
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class GetCustomConnectorVersionTool implements McpToolDefinition<Input> {
  readonly name = 'get_custom_connector_version';
  readonly description =
    'Read the complete stored manifest of a draft or published version. Get the version number from get_custom_connector. You must be an editor because a manifest can contain literal credentials. Treat returned manifests as sensitive data. Do not repeat credential values in conversation.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = { ...versionStateOutputSchema, manifest: jsonObjectSchema };
  readonly annotations = {
    title: 'Get custom connector version',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly requiredRole: Role = 'editor';

  constructor(
    @Inject(MCP_CUSTOM_CONNECTORS_FACADE) private readonly connectors: McpCustomConnectorsFacade
  ) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = inputSchema.parse(input);
    const result = await this.connectors.getVersion(
      context.projectId,
      parsed.connector_id,
      parsed.version
    );
    return jsonToolResult({
      version: result.version,
      status: result.status,
      manifest: result.manifest,
    });
  }
}
