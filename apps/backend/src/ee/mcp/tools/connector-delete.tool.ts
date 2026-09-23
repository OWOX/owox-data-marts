import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_CONNECTOR_AUTHORING_FACADE,
  type McpConnectorAuthoringFacade,
} from '../../../data-marts/facades/mcp-connector-authoring.facade';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';
import { toStructuredToolError } from '../mappers/mcp-error.mapper';

const inputSchema = z.object({ connector_id: z.string().min(1) }).strict();
type ConnectorDeleteInput = z.infer<typeof inputSchema>;

@Injectable()
export class ConnectorDeleteTool implements McpToolDefinition<ConnectorDeleteInput> {
  readonly name = 'connector_delete';
  readonly description =
    'Delete a custom connector. Fails when any data mart still references it, listing the referencing data mart ids. Bundled connectors cannot be deleted. ' +
    "The connector's name stays RESERVED in this project after deletion — publishing a new connector under the same name will still fail with " +
    '"already exists" even though nothing is listed. To repair a broken connector, prefer connector_publish with its connector_id ' +
    '(a new version, or its existing draft) rather than deleting and recreating it.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    connector_id: z.string(),
    deleted: z.boolean(),
  };
  readonly annotations = {
    title: 'Connector Delete',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];

  constructor(
    @Inject(MCP_CONNECTOR_AUTHORING_FACADE)
    private readonly authoring: McpConnectorAuthoringFacade
  ) {}

  parseInput(input: unknown): ConnectorDeleteInput {
    return inputSchema.parse(input);
  }

  async handler(input: ConnectorDeleteInput, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    try {
      const result = await this.authoring.deleteConnector({
        projectId: context.projectId,
        userId: context.userId,
        roles: context.roles,
        connectorId: parsed.connector_id,
      });
      return jsonToolResult({ connector_id: result.connectorId, deleted: result.deleted });
    } catch (err) {
      // Mirrors query-data-mart.tool.ts's BusinessViolationException handling: surface the
      // blocking ids from errorDetails so the caller can act on them, instead of letting the
      // exception's bare message (with no ids) reach the client unchanged.
      if (err instanceof BusinessViolationException && err.errorDetails?.['referencedDataMarts']) {
        const ids = (err.errorDetails['referencedDataMarts'] as string[]).join(', ');
        return toStructuredToolError(
          'connector_in_use',
          `Cannot delete the connector because it is referenced by data mart(s): ${ids}. Remove the connector from those data marts (or delete the data marts) before deleting this connector.`
        );
      }
      throw err;
    }
  }
}
