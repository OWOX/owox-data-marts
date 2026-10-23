import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_DATA_MART_SETUP_FACADE,
  type McpDataMartSetupFacade,
} from '../../../../data-marts/facades/mcp-data-mart-setup.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { dataMartTargetShape } from './data-mart-configuration.schemas';
const inputSchema = z.object({ ...dataMartTargetShape }).strict();
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class ValidateDataMartDefinitionTool implements McpToolDefinition<Input> {
  readonly name = 'validate_data_mart_definition';
  readonly description =
    'Validate the currently saved Data Mart definition against its storage. Returns the existing API validation result without saving a replacement definition. Requires editor or admin and access to the Data Mart.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    valid: z.boolean().describe('Whether the saved source definition passed warehouse validation.'),
    error_message: z
      .string()
      .optional()
      .describe('Validation failure explanation when supplied by the storage validator.'),
    details: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'Storage-specific validation details. Keys and value shapes vary by warehouse and are returned as provided by its validator.'
      ),
    reason: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'Storage-specific failure diagnostics when available; there is no shared cross-warehouse structure.'
      ),
  };
  readonly annotations = {
    title: 'Validate Data Mart Definition',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];

  constructor(
    @Inject(MCP_DATA_MART_SETUP_FACADE) private readonly facade: McpDataMartSetupFacade
  ) {}

  parseInput(input: unknown): Input {
    return inputSchema.parse(input);
  }

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const ctx = { projectId: context.projectId, userId: context.userId, roles: context.roles };
    const result = await this.facade.validateDataMartDefinition(ctx, {
      dataMartId: parsed.data_mart_id,
    });
    return jsonToolResult({
      valid: result.valid,
      ...(result.errorMessage !== undefined ? { error_message: result.errorMessage } : {}),
      ...(result.details !== undefined ? { details: result.details } : {}),
      ...(result.reason !== undefined ? { reason: result.reason } : {}),
    });
  }
}
