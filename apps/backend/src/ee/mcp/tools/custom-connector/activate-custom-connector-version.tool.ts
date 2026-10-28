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
  connectorActivatedOutputSchema,
} from './custom-connector.schemas';
import { CustomConnectorToolMapper } from './custom-connector-tool.mapper';

const inputSchema = connectorVersionTargetSchema;
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class ActivateCustomConnectorVersionTool implements McpToolDefinition<Input> {
  readonly name = 'activate_custom_connector_version';
  readonly description =
    'Make an existing published version active, including an earlier version for rollback. You must be an editor with edit access to every Data Mart that follows the active version. If you do not have this access, ask a project admin or request edit access. Draft versions cannot be activated. Activation changes future runs of Data Marts that follow the active version. Data Marts pinned to a version keep that version.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = connectorActivatedOutputSchema;
  readonly annotations = {
    title: 'Activate custom connector version',
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
    const result = await this.connectors.activate(context, parsed.connector_id, parsed.version);
    return jsonToolResult(this.mapper.toActivated(result));
  }
}
