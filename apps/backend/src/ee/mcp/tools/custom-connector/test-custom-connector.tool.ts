import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_CUSTOM_CONNECTORS_FACADE,
  type McpCustomConnectorsFacade,
} from '../../../../data-marts/facades/mcp-custom-connectors.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { testConnectorSchema, connectorTestOutputSchema } from './custom-connector.schemas';

import { boundTestLogsForMcp } from './custom-connector-test-logs';

const inputSchema = testConnectorSchema;
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class TestCustomConnectorTool implements McpToolDefinition<Input> {
  readonly name = 'test_custom_connector';
  readonly description =
    'Run a bounded live test of one node in the supplied manifest without saving it. You must be an editor with mcp:write. The test calls the upstream API and may trigger effects described in the manifest.\n\nSupply configuration as a flat map of parameter names to values. max_rows accepts 1-1000 and defaults to 25. max_pages accepts 1-50 and defaults to 1. The runner has a 20-second budget and concurrency limits.\n\nThe result includes rows, error, raw sample records and bounded recent logs. Notices identify omitted or shortened log content. Check logs and sample even when error is null. Empty rows alone do not prove that the test succeeded. Treat results and credentials as sensitive data.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = connectorTestOutputSchema;
  readonly annotations = {
    title: 'Test custom connector',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: true,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'editor';

  constructor(
    @Inject(MCP_CUSTOM_CONNECTORS_FACADE) private readonly connectors: McpCustomConnectorsFacade
  ) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = inputSchema.parse(input);
    const result = await this.connectors.test(context.projectId, {
      manifest: parsed.manifest,
      node: parsed.node,
      configuration: parsed.configuration,
      maxRows: parsed.max_rows,
      maxPages: parsed.max_pages,
    });
    const response = jsonToolResult({
      rows: result.rows,
      logs: boundTestLogsForMcp(result.logs),
      error: result.error,
      sample: result.sample,
    });
    return result.error
      ? {
          ...response,
          isError: true,
          content: [{ type: 'text', text: result.error }, ...response.content],
        }
      : response;
  }
}
