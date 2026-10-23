import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_DATA_MART_SETUP_FACADE,
  type McpDataMartSetupFacade,
} from '../../../../data-marts/facades/mcp-data-mart-setup.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import {
  dataMartTargetShape,
  dataMartConfigurationOutput,
  dataMartSchemaInput,
  formulaViolationSchema,
} from './data-mart-configuration.schemas';
const inputSchema = z.object({ ...dataMartTargetShape, schema: dataMartSchemaInput }).strict();
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class UpdateDataMartSchemaTool implements McpToolDefinition<Input> {
  readonly name = 'update_data_mart_schema';
  readonly description =
    'Replace the full output schema of a Data Mart, including field descriptions, aliases, hidden flags, primary keys, aggregation rules and calculated formulas. Start from get_data_mart_configuration and preserve fields that should remain. The schema uses the existing API shape and warehouse type vocabulary. Field connection status and calculated-field validation status are server-owned. Returns non-blocking formula warnings; warehouse validation may be skipped when credentials or the warehouse are unavailable. Requires editor or admin and edit access.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    ...dataMartConfigurationOutput,
    warnings: z.array(formulaViolationSchema),
  };
  readonly annotations = {
    title: 'Update Data Mart Schema',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: true,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];

  constructor(
    @Inject(MCP_DATA_MART_SETUP_FACADE) private readonly facade: McpDataMartSetupFacade
  ) {}

  parseInput(input: unknown): Input {
    return inputSchema.parse(input);
  }

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const ctx = { projectId: context.projectId, userId: context.userId, roles: context.roles };
    const result = await this.facade.updateDataMartSchema(ctx, {
      dataMartId: parsed.data_mart_id,
      schema: parsed.schema,
    });
    const { warnings, ...dataMart } = result;
    return jsonToolResult({ data_mart: dataMart, warnings });
  }
}
