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
    'Run a bounded live test of one node in the supplied manifest without saving it. You must be an editor with mcp:write. The test calls the upstream API and may trigger effects described in the manifest.\n\nSupply configuration as a flat map of parameter names to values. For authentication, use credential_id to select a compatible saved Credential. Alternatively, omit credential_id and pass temporary keys in configuration for this test. Mark secret parameters with attributes: ["SECRET"] and reference them from the manifest. With credential_id, omit all Credential fields from configuration. Use start_credential_setup to save or update access in the browser.\n\nThe test does not save temporary keys. They pass through your AI client and may reach its provider. Public connectors need no Credential.\n\nmax_rows accepts 1-1000 and defaults to 25. max_pages accepts 1-50 and defaults to 1. The runner has a 20-second budget and concurrency limits.\n\nThe result includes rows, error, raw sample records and bounded recent logs. Notices identify omitted or shortened log content. Check logs and sample even when error is null. Empty rows alone do not prove that the test succeeded. The result masks recognized credential values. Treat results as sensitive data.';
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
