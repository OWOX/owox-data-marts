import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_CONNECTOR_AUTHORING_FACADE,
  type McpConnectorAuthoringFacade,
} from '../../../data-marts/facades/mcp-connector-authoring.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';

const inputSchema = z.object({ connector_id: z.string().min(1) }).strict();
type ConnectorVersionsInput = z.infer<typeof inputSchema>;

@Injectable()
export class ConnectorVersionsTool implements McpToolDefinition<ConnectorVersionsInput> {
  readonly name = 'connector_versions';
  readonly description =
    'List every version of a custom connector with its status, publish time, and whether it is the active one. Use connector_set_version to roll back to an earlier published version.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    versions: z.array(
      z.object({
        version: z.number(),
        status: z.string(),
        publishedAt: z.string().nullable(),
        isActive: z.boolean(),
      })
    ),
  };
  readonly annotations = {
    title: 'Connector Versions',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];

  constructor(
    @Inject(MCP_CONNECTOR_AUTHORING_FACADE)
    private readonly authoring: McpConnectorAuthoringFacade
  ) {}

  parseInput(input: unknown): ConnectorVersionsInput {
    return inputSchema.parse(input);
  }

  async handler(input: ConnectorVersionsInput, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const result = await this.authoring.listConnectorVersions({
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
      connectorId: parsed.connector_id,
    });
    return jsonToolResult({ versions: result.versions });
  }
}
