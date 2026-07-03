import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_DATA_MARTS_FACADE,
  type McpDataMartsFacade,
} from '../../../data-marts/facades/mcp-data-marts.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';

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

const JoinedFieldSchema = z
  .object({
    name: z
      .string()
      .describe(
        'Qualified field name (<alias>__<field>) — copy verbatim into query_data_mart fields/slices/filters.'
      ),
    type: z.string(),
    description: z.string().optional().nullable(),
    sourceDataMart: z.string().describe('Title of the joined data mart this field comes from.'),
    allowedAggregations: z
      .array(z.string())
      .optional()
      .describe('Aggregations permitted on this blended field (governance), when restricted.'),
  })
  .passthrough();

@Injectable()
export class GetDataMartDetailsTool implements McpToolDefinition<GetDataMartDetailsInput> {
  readonly name = 'get_data_mart_details_by_id';
  readonly description =
    'Get available details for a specific OWOX Data Mart by data_mart_id, including id, name, description, output fields (native), and joined_fields contributed by blended/joined data marts. Native fields and joined_fields are both queryable in query_data_mart — reference joined_fields by their qualified <alias>__<field> name; joined_fields can additionally be used in query_data_mart slices (pre-join filters). This tool is optional in the discovery flow: get_relevant_data_marts_by_prompt finds relevant Data Marts, and this tool adds field-level metadata for a selected Data Mart. It does not return data owners, data freshness, sample values, or actual data rows.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    id: z.string().describe('Data mart identifier.'),
    name: z.string().describe('Data mart display name.'),
    description: z.string().describe('Data mart description.'),
    fields: z.array(DataMartFieldSchema).describe("The data mart's own (native) output fields."),
    joined_fields: z
      .array(JoinedFieldSchema)
      .describe(
        'Fields available from joined/blended data marts. Empty when the data mart has no joins. Reference each by its exact "name" in query_data_mart; because they come from a joined data mart they may also be used in "slices".'
      ),
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
      joined_fields: result.joinedFields,
    };

    return jsonToolResult(structuredContent);
  }
}
