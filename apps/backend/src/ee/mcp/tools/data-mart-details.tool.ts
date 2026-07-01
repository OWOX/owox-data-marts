import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_DATA_MARTS_FACADE,
  type McpDataMartsFacade,
} from '../../../data-marts/facades/mcp-data-marts.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import type { McpToolDefinition, McpToolResult } from './mcp-tool.definition';

const inputSchema = z
  .object({
    data_mart_id: z.string().trim().min(1),
  })
  .strict();

type GetDataMartDetailsInput = z.infer<typeof inputSchema>;

const DataMartFieldSchema = z
  .object({
    name: z.string(),
    type: z.string(),
    description: z.string().optional().nullable(),
    businessName: z.string().optional(),
  })
  .passthrough();

@Injectable()
export class GetDataMartDetailsTool implements McpToolDefinition<GetDataMartDetailsInput> {
  readonly name = 'get_data_mart_details_by_id';
  readonly description =
    'Returns full details for a specific OWOX Data Mart, including its full output schema fields prepared for LLM use. Call before every query_data_mart unless the schema is already in context.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    id: z.string(),
    name: z.string(),
    description: z.string(),
    fields: z.array(DataMartFieldSchema),
  };
  readonly annotations = {
    title: 'Get Data Mart Details',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];

  constructor(
    @Inject(MCP_DATA_MARTS_FACADE)
    private readonly dataMarts: McpDataMartsFacade
  ) {}

  parseInput(input: unknown): GetDataMartDetailsInput {
    return inputSchema.parse(input);
  }

  async handler(input: GetDataMartDetailsInput, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);

    const result = await this.dataMarts.getDataMartDetails({
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
      dataMartId: parsed.data_mart_id,
    });
    const structuredContent = {
      id: result.id,
      name: result.name,
      description: result.description,
      fields: result.fields,
    };

    return {
      structuredContent,
      content: [
        {
          type: 'text',
          text: JSON.stringify(structuredContent, null, 2),
        },
      ],
    };
  }
}
