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
    manifest: z.record(z.unknown()).describe('The connector manifest to dry-run'),
    node: z.string().min(1).describe('The manifest node to test'),
    configuration: z
      .record(z.unknown())
      .optional()
      .describe(
        'Non-secret config values only. Do NOT put API keys/tokens here — secure credential entry arrives via the browser in a later step.'
      ),
    max_rows: z.number().int().min(1).max(100).optional(),
    max_pages: z.number().int().min(1).max(10).optional(),
  })
  .strict();

type TestConnectorInput = z.infer<typeof inputSchema>;

@Injectable()
export class ConnectorTestTool implements McpToolDefinition<TestConnectorInput> {
  readonly name = 'connector_test';
  readonly description =
    'Dry-run one node of a connector manifest against the target API and return sample rows, the run logs, and an error (or null) so the build can be verified and fixed. ' +
    'ALWAYS read `logs` before treating a result as a pass: an empty `rows` with `error: null` is usually a wrong recordSelector.recordPath, and only the logs say so. ' +
    'Use only non-secret config; do not paste API keys.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    rows: z.array(z.record(z.unknown())),
    sample: z.array(z.record(z.unknown())),
    error: z.string().nullable(),
    logs: z.array(z.string()),
  };
  readonly annotations = {
    title: 'Connector Test',
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: true,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];

  constructor(
    @Inject(MCP_CONNECTOR_AUTHORING_FACADE)
    private readonly authoring: McpConnectorAuthoringFacade
  ) {}

  parseInput(input: unknown): TestConnectorInput {
    return inputSchema.parse(input);
  }

  async handler(input: TestConnectorInput, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const result = await this.authoring.testConnector({
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
      manifest: parsed.manifest,
      node: parsed.node,
      configuration: parsed.configuration,
      maxRows: parsed.max_rows,
      maxPages: parsed.max_pages,
    });
    return jsonToolResult({
      rows: result.rows,
      sample: result.sample,
      error: result.error,
      logs: result.logs,
    });
  }
}
