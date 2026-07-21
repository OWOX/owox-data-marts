import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_DATA_MARTS_FACADE,
  type McpDataMartsFacade,
} from '../../../data-marts/facades/mcp-data-marts.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';
import {
  categorizeFieldType,
  type FieldTypeCategory,
} from '../../../data-marts/dto/schemas/field-type-category';
import type { AggregationRole } from '../../../data-marts/dto/schemas/field-aggregation-governance';
import type { ReportAggregateFunction } from '../../../data-marts/dto/schemas/aggregate-function.schema';
import { effectiveMcpAggregations, mcpOperatorsForCategory } from './field-type-matrix';

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
    category: z
      .string()
      .optional()
      .describe(
        'Field-type category (number/string/date/time/boolean/other) — the key into operators_by_category for the filter/slice operators this field accepts.'
      ),
    allowedAggregations: z
      .array(z.string())
      .optional()
      .describe(
        'The aggregation functions query_data_mart may apply to THIS field (type defaults narrowed by per-field settings). Use only these; an empty array means the field cannot be aggregated.'
      ),
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
    category: z
      .string()
      .optional()
      .describe(
        'Field-type category (number/string/date/time/boolean/other) — the key into operators_by_category for the filter/slice operators this field accepts.'
      ),
    allowedAggregations: z
      .array(z.string())
      .optional()
      .describe(
        'The aggregation functions query_data_mart may apply to THIS blended field (type defaults narrowed by data-mart governance). Use only these.'
      ),
  })
  .passthrough();

type RawField = Record<string, unknown>;

@Injectable()
export class GetDataMartDetailsTool implements McpToolDefinition<GetDataMartDetailsInput> {
  readonly name = 'get_data_mart_details_by_id';
  readonly description =
    'Get available details for a specific OWOX Data Mart by data_mart_id, including id, name, description, output fields (native), and joined_fields contributed by blended/joined data marts. Native fields and joined_fields are both queryable in query_data_mart — reference joined_fields by their qualified <alias>__<field> name; joined_fields can additionally be used in query_data_mart slices (pre-join filters). Each field carries its type "category" and the effective "allowedAggregations" query_data_mart may apply to it; "operators_by_category" maps each category to the filter/slice operators its fields accept — build queries from these instead of guessing. This tool is optional in the discovery flow: get_relevant_data_marts_by_prompt finds relevant Data Marts, and this tool adds field-level metadata for a selected Data Mart. It does not return data owners, data freshness, sample values, or actual data rows.';
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
    operators_by_category: z
      .record(z.string(), z.array(z.string()))
      .describe(
        'For each field-type category present in this data mart, the query_data_mart filter/slice operators its fields accept. Look up a field via its "category". For boolean fields, eq/neq take a boolean true or false as the value.'
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

    const categories = new Set<FieldTypeCategory>();
    const fields = result.fields.map(f => this.enrichField(f as RawField, categories));
    const joinedFields = result.joinedFields.map(f => ({
      ...f,
      category: categorizeFieldType(f.type),
      allowedAggregations: effectiveMcpAggregations(
        f.type,
        f.allowedAggregations
          ? { allowedAggregations: f.allowedAggregations as ReportAggregateFunction[] }
          : undefined
      ),
    }));
    for (const f of joinedFields) categories.add(f.category);

    const operatorsByCategory: Record<string, string[]> = {};
    for (const category of categories) {
      operatorsByCategory[category] = mcpOperatorsForCategory(category);
    }

    const structuredContent = {
      id: result.id,
      name: result.name,
      description: result.description,
      fields,
      joined_fields: joinedFields,
      operators_by_category: operatorsByCategory,
    };

    return jsonToolResult(structuredContent);
  }

  /**
   * Annotates a schema field (and, for RECORD-like fields, its nested fields) with its
   * type category and the effective aggregations query_data_mart may apply to it —
   * resolved with the SAME governance function the validator enforces, so the advertised
   * set cannot drift from what a query is actually allowed to do.
   */
  private enrichField(field: RawField, categories: Set<FieldTypeCategory>): RawField {
    const out: RawField = { ...field };
    if (typeof out.type === 'string') {
      const category = categorizeFieldType(out.type);
      categories.add(category);
      out.category = category;
      out.allowedAggregations = effectiveMcpAggregations(out.type, {
        aggregationRole: out.aggregationRole as AggregationRole | undefined,
        allowedAggregations: out.allowedAggregations as ReportAggregateFunction[] | undefined,
      });
    }
    if (Array.isArray(out.fields)) {
      out.fields = (out.fields as RawField[]).map(f => this.enrichField(f, categories));
    }
    return out;
  }
}
