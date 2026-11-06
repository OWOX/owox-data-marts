import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { castError } from '@owox/internal-helpers';
import { z } from 'zod';
import {
  MCP_CUSTOM_CONNECTORS_FACADE,
  type McpCustomConnectorsFacade,
} from '../../../../data-marts/facades/mcp-custom-connectors.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { createMcpInputSecretRedactor } from '../../observability/mcp-telemetry-redaction';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { testConnectorSchema, connectorTestOutputSchema } from './custom-connector.schemas';

import { boundTestLogsForMcp } from './custom-connector-test-logs';

const inputSchema = testConnectorSchema;
const resultValuesSchema = z.tuple([
  connectorTestOutputSchema.rows,
  connectorTestOutputSchema.logs,
  connectorTestOutputSchema.error,
  connectorTestOutputSchema.sample,
]);
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class TestCustomConnectorTool implements McpToolDefinition<Input> {
  readonly name = 'test_custom_connector';
  readonly description =
    'Run a bounded live test of one custom connector node during development.\n\nSupply manifest, a node key from manifest.nodes, and configuration as a flat parameter map. For authentication, use a compatible credential_id or temporary keys in configuration. Temporary keys pass through the AI client and may reach its provider.\n\nThe test makes live API requests defined by the manifest and can change external data. It does not save the manifest or configuration. Authentication may update tokens in the selected Credential.\n\nReturns rows, logs, error and sample. Check logs and sample even when error is null. Defaults: 25 rows and 1 page. Execution budget: 20 seconds. Requires editor access and mcp:write.';
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
    const redactResult = createMcpInputSecretRedactor(parsed);
    const result = await this.connectors
      .test(
        { projectId: context.projectId, userId: context.userId, roles: context.roles },
        {
          manifest: parsed.manifest,
          node: parsed.node,
          configuration: parsed.configuration,
          credentialId: parsed.credential_id,
          maxRows: parsed.max_rows,
          maxPages: parsed.max_pages,
        }
      )
      .catch((error: unknown) => {
        const cause = castError(error);
        const safeError = new Error(z.string().parse(redactResult(cause.message)));
        safeError.name = cause.name;
        throw safeError;
      });
    // Mask complete values before log limits can cut a secret into an unrecognized fragment.
    // Preserve the API field names when a secret happens to equal one of them.
    const [rows, logs, error, sample] = resultValuesSchema.parse(
      redactResult([result.rows, result.logs, result.error, result.sample])
    );
    const response = jsonToolResult({
      rows,
      logs: boundTestLogsForMcp(logs),
      error,
      sample,
    });
    return error
      ? {
          ...response,
          isError: true,
          content: [{ type: 'text', text: error }, ...response.content],
        }
      : response;
  }
}
