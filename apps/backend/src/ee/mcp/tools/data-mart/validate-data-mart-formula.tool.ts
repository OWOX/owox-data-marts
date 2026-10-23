import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_DATA_MART_SETUP_FACADE,
  type McpDataMartSetupFacade,
} from '../../../../data-marts/facades/mcp-data-mart-setup.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { dataMartTargetShape, formulaViolationSchema } from './data-mart-configuration.schemas';
const inputSchema = z
  .object({
    ...dataMartTargetShape,
    name: z.string().min(1).describe('Name of the top-level calculated field being checked.'),
    type: z
      .string()
      .min(1)
      .describe(
        'Canonical field type for the Data Mart storage, such as BigQuery NUMERIC. Use the vocabulary in get_data_mart_configuration.schema.'
      ),
    formula: z
      .string()
      .min(1)
      .max(10000)
      .describe(
        'Warehouse SQL expression using {{ref field="amount"}} tags, for example SUM({{ref field="amount"}}). This call validates without saving.'
      ),
    calculated_fields: z
      .array(
        z
          .object({
            name: z.string().min(1).describe('Name of a draft calculated field.'),
            type: z.string().min(1).describe('Canonical field type for the same warehouse.'),
            formula: z
              .string()
              .min(1)
              .max(10000)
              .describe('Draft formula with {{ref}} references.'),
          })
          .strict()
      )
      .max(100)
      .optional()
      .describe(
        'All draft calculated fields to resolve sibling references before saving. Omit to use the saved schema; at most 100 fields.'
      ),
  })
  .strict();
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class ValidateDataMartFormulaTool implements McpToolDefinition<Input> {
  readonly name = 'validate_data_mart_formula';
  readonly description =
    'Check a calculated field formula without saving it or querying the warehouse. Uses stored SQL with {{ref}} tags, just like the schema API. Optionally send all draft calculated_fields so sibling formulas resolve before saving. Reports errors, warnings, and errors in other fields that would block the save. Requires editor or admin and edit access.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    errors: z
      .array(formulaViolationSchema)
      .describe('Blocking violations in the field being checked.'),
    warnings: z.array(formulaViolationSchema).describe('Non-blocking advisories.'),
    other_field_errors: z
      .array(formulaViolationSchema)
      .describe(
        'Blocking violations in sibling fields that would prevent saving the whole schema.'
      ),
  };
  readonly annotations = {
    title: 'Validate Data Mart Formula',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
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
    const result = await this.facade.validateDataMartFormula(ctx, {
      dataMartId: parsed.data_mart_id,
      name: parsed.name,
      type: parsed.type,
      formula: parsed.formula,
      ...(parsed.calculated_fields !== undefined
        ? { calculatedFields: parsed.calculated_fields }
        : {}),
    });
    return jsonToolResult({
      errors: result.errors,
      warnings: result.warnings,
      other_field_errors: result.otherFieldErrors,
    });
  }
}
