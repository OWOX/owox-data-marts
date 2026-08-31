import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_CONNECTORS_FACADE,
  type McpConnectorsFacade,
} from '../../../data-marts/facades/mcp-connectors.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';

const inputSchema = z
  .object({ connector: z.string().min(1), version: z.number().int().positive().optional() })
  .strict();
type ConnectorDetailsInput = z.infer<typeof inputSchema>;

@Injectable()
export class ConnectorDetailsTool implements McpToolDefinition<ConnectorDetailsInput> {
  readonly name = 'connector_details';
  readonly description =
    'Get the configuration fields, output nodes (streams), and — for a custom connector — the raw manifest of the active or requested version. ' +
    'The manifest is null for bundled connectors, which have none, and for callers without the editor or admin project role. ' +
    'Read this before updating a connector with connector_publish. ' +
    '`connector_id` is what connector_publish (to update), connector_delete, connector_versions, and connector_set_version take; ' +
    'it is null for bundled connectors, which cannot be updated, deleted, or versioned.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    name: z.string(),
    connector_id: z.string().nullable(),
    configFields: z.array(z.record(z.unknown())),
    nodes: z.array(z.record(z.unknown())),
    manifest: z.record(z.unknown()).nullable(),
  };
  readonly annotations = {
    title: 'Connector Details',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];

  constructor(@Inject(MCP_CONNECTORS_FACADE) private readonly connectors: McpConnectorsFacade) {}

  parseInput(input: unknown): ConnectorDetailsInput {
    return inputSchema.parse(input);
  }

  async handler(input: ConnectorDetailsInput, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const result = await this.connectors.getConnectorDetails({
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
      connector: parsed.connector,
      version: parsed.version,
    });
    return jsonToolResult({
      name: result.name,
      connector_id: result.connectorId,
      configFields: result.configFields,
      nodes: result.nodes,
      manifest: result.manifest,
    });
  }
}
