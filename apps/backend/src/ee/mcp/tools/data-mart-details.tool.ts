import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_DATA_MARTS_FACADE,
  type McpDataMartsFacade,
} from '../../../data-marts/facades/mcp-data-marts.facade';
import { PublicOriginService } from '../../../common/config/public-origin.service';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';
import { buildDataMartUiPath } from './data-mart-ui-path';
import { joinPublicOrigin } from './mcp-public-url.util';

const inputSchema = z
  .object({
    data_mart_id: z.string().trim().min(1),
    detail_level: z
      .enum(['native', 'with_joined_fields'])
      .optional()
      .describe(
        'Use native (default) for ordinary queries. Request with_joined_fields only when the answer requires data from a joined Data Mart.'
      ),
  })
  .strict();

type GetDataMartDetailsInput = z.infer<typeof inputSchema>;

const DataMartFieldSchema = z
  .object({
    name: z.string(),
    type: z.string(),
    description: z.string().optional().nullable(),
    businessName: z.string().optional(),
    displayName: z.string().optional(),
  })
  .passthrough();

const JoinedFieldSchema = z
  .object({
    name: z
      .string()
      .describe(
        'Qualified field name (<alias>__<field>) — copy verbatim into query_data_mart fields/slices/filters.'
      ),
    displayName: z
      .string()
      .describe('Business-friendly label for presentation; use name for queries.'),
    type: z
      .string()
      .describe(
        'Type in the blended result — use it to pick operators for filters and functions for aggregations. For a slice, use "sliceType" instead when it is present.'
      ),
    description: z.string().optional().nullable(),
    sourceDataMart: z.string().describe('Title of the joined data mart this field comes from.'),
    sliceType: z
      .string()
      .optional()
      .describe(
        'Present only when this field is deduplicated with a type-changing aggregation. A slice runs BEFORE the join on the original value, so pick slice operators for this pre-join type — not "type". Absent when the two are the same.'
      ),
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
    'Get available details for a specific published OWOX Data Mart by data_mart_id, including its URL, native output fields, and (only on explicit request) joined_fields contributed by blended/joined data marts. Use detail_level=native by default: it avoids exposing irrelevant joined fields and keeps the response fast. Request detail_level=with_joined_fields only when the question truly needs a joined Data Mart. Use displayName for user-facing wording and copy name verbatim into query_data_mart. This tool is optional in the discovery flow: get_relevant_data_marts_by_prompt finds relevant Data Marts, and this tool adds field-level metadata for a selected Data Mart. It does not return data owners, data freshness, sample values, or actual data rows.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    id: z.string().describe('Data mart identifier.'),
    name: z.string().describe('Data mart display name.'),
    url: z.string().describe('Open this Data Mart in OWOX.'),
    description: z.string().describe('Data mart description.'),
    fields: z.array(DataMartFieldSchema).describe("The data mart's own (native) output fields."),
    joined_fields_included: z
      .boolean()
      .describe(
        'Whether joined_fields were requested and evaluated. false means joined fields were intentionally omitted; true means an empty joined_fields array has no accessible joined fields.'
      ),
    joined_fields: z
      .array(JoinedFieldSchema)
      .describe(
        'Fields available from joined/blended data marts when joined_fields_included is true. Reference each by its exact "name" in query_data_mart; because they come from a joined data mart they may also be used in "slices".'
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
    private readonly dataMarts: McpDataMartsFacade,
    private readonly publicOriginService: PublicOriginService
  ) {}

  parseInput(input: unknown): GetDataMartDetailsInput {
    return inputSchema.parse(input);
  }

  async handler(input: GetDataMartDetailsInput, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const includeJoinedFields = parsed.detail_level === 'with_joined_fields';

    const result = await this.dataMarts.getDataMartDetails({
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
      dataMartId: parsed.data_mart_id,
      includeJoinedFields,
    });
    const structuredContent = {
      id: result.id,
      name: result.name,
      url: joinPublicOrigin(
        this.publicOriginService.getPublicOrigin(),
        buildDataMartUiPath(context.projectId, result.id)
      ),
      description: result.description,
      fields: result.fields,
      joined_fields_included: includeJoinedFields,
      joined_fields: result.joinedFields,
    };

    return jsonToolResult(structuredContent);
  }
}
