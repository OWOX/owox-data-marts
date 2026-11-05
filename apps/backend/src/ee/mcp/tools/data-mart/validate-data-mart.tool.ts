import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod';
import {
  MCP_DATA_MART_MANAGEMENT_FACADE,
  type McpDataMartManagementFacade,
} from '../../../../data-marts/facades/mcp-data-mart-management.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { DataMartToolMapper } from './data-mart-tool.mapper';
import { dataMartToolCall } from './data-mart-tool-error';
import { dataMartIdSchema } from './data-mart.schemas';

type Input = z.input<typeof dataMartIdSchema>;

@Injectable()
export class ValidateDataMartTool implements McpToolDefinition<Input> {
  readonly name = 'validate_data_mart';
  readonly description =
    'Validate the saved definition against the configured Storage. The tool may query the warehouse and create or replace an OWOX-managed technical view. It does not publish the Data Mart or save its schema.';
  readonly zodSchema = dataMartIdSchema;
  readonly outputSchema = { valid: z.boolean(), message: z.string() };
  readonly annotations = {
    title: 'Validate Data Mart',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'editor';
  private readonly mapper = new DataMartToolMapper();

  constructor(
    @Inject(MCP_DATA_MART_MANAGEMENT_FACADE)
    private readonly dataMarts: McpDataMartManagementFacade
  ) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = dataMartIdSchema.parse(input);
    const actor = this.mapper.toActor(context);
    const result = await dataMartToolCall(() =>
      this.dataMarts.validate(actor, parsed.data_mart_id)
    );
    return jsonToolResult({ ...result });
  }
}
