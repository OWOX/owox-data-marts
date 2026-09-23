import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_CONNECTOR_AUTHORING_FACADE,
  type McpConnectorAuthoringFacade,
} from '../../../data-marts/facades/mcp-connector-authoring.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';

const inputSchema = z
  .object({
    connector_id: z.string().min(1),
    version: z.number().int().positive(),
  })
  .strict();
type ConnectorSetVersionInput = z.infer<typeof inputSchema>;

@Injectable()
export class ConnectorSetVersionTool implements McpToolDefinition<ConnectorSetVersionInput> {
  readonly name = 'connector_set_version';
  readonly description =
    'Make a published version of a custom connector the active one — use this to roll back a bad update. The version must already be published; call connector_versions first to see what is available.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    connector_id: z.string(),
    active_version: z.number(),
  };
  readonly annotations = {
    title: 'Connector Set Version',
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];

  constructor(
    @Inject(MCP_CONNECTOR_AUTHORING_FACADE)
    private readonly authoring: McpConnectorAuthoringFacade
  ) {}

  parseInput(input: unknown): ConnectorSetVersionInput {
    return inputSchema.parse(input);
  }

  async handler(input: ConnectorSetVersionInput, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const result = await this.authoring.setConnectorVersion({
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
      connectorId: parsed.connector_id,
      version: parsed.version,
    });
    return jsonToolResult({
      connector_id: result.connectorId,
      active_version: result.activeVersion,
    });
  }
}
