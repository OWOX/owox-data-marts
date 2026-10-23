import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import { PublicOriginService } from '../../../../common/config/public-origin.service';
import {
  MCP_DATA_MART_SETUP_FACADE,
  type McpDataMartSetupFacade,
} from '../../../../data-marts/facades/mcp-data-mart-setup.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { buildDataMartUiPath } from '../data-mart-ui-path';
import { joinPublicOrigin } from '../mcp-public-url.util';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { dataMartIconSchema } from './data-mart-configuration.schemas';
const inputSchema = z
  .object({
    title: z.string().min(1),
    storage_id: z.string().min(1),
    icon: dataMartIconSchema.nullable().optional(),
    connector_name: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        'Optional connector source name from list_connectors to preselect in setup_url. This UI hint does not save a connector definition or credentials.'
      ),
  })
  .strict();
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class CreateDataMartTool implements McpToolDefinition<Input> {
  readonly name = 'create_data_mart';
  readonly description =
    'Create a draft Data Mart in the connected project using an existing storage from list_data_storages. Requires editor or admin and permission to use that storage. Returns setup_url and actionable next_steps. Optional connector_name preselects the connector in the web app, where the user authenticates or picks a spreadsheet and saves setup. After user confirmation, read get_data_mart_configuration and list_connector_configurations for the same draft, then validate its saved definition. Saving setup does not establish validity. Other sources can be configured with update_data_mart_definition before validation, schema actualization and publishing.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    data_mart: z.object({ id: z.string(), title: z.string() }),
    setup_url: z
      .string()
      .describe(
        'Web app setup URL for this draft in the connected project, with optional connector preselection.'
      ),
    next_steps: z
      .array(z.string())
      .min(1)
      .describe(
        'Actions to save and validate the draft source, including the UI handoff when needed.'
      ),
  };
  readonly annotations = {
    title: 'Create Data Mart',
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: true,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];

  constructor(
    @Inject(MCP_DATA_MART_SETUP_FACADE) private readonly facade: McpDataMartSetupFacade,
    private readonly publicOriginService: PublicOriginService
  ) {}

  parseInput(input: unknown): Input {
    return inputSchema.parse(input);
  }

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const ctx = { projectId: context.projectId, userId: context.userId, roles: context.roles };
    const result = await this.facade.createDataMart(ctx, {
      title: parsed.title,
      storageId: parsed.storage_id,
      ...(parsed.icon !== undefined ? { icon: parsed.icon } : {}),
    });
    const setupPath =
      buildDataMartUiPath(context.projectId, result.id) +
      (parsed.connector_name !== undefined
        ? `?preset=connector&connectorName=${encodeURIComponent(parsed.connector_name)}`
        : '');
    const nextSteps = [
      parsed.connector_name !== undefined
        ? 'Open setup_url. Have the user authenticate or choose the source spreadsheet with the picker, then save setup in the web app.'
        : 'Configure the draft with update_data_mart_definition. If new connector credentials or spreadsheet selection are needed, open setup_url, authenticate or use the picker, and save setup in the web app.',
      `After UI setup, wait for the user to confirm it was saved. Then call get_data_mart_configuration with data_mart_id ${JSON.stringify(result.id)} and list_connector_configurations for the connector; use only configurations whose data_mart_id matches this same draft.`,
      `Validate the saved definition with validate_data_mart_definition for data_mart_id ${JSON.stringify(result.id)} before actualizing the schema or publishing. Saving setup does not establish that the definition is valid.`,
    ];
    return jsonToolResult({
      data_mart: result,
      setup_url: joinPublicOrigin(this.publicOriginService.getPublicOrigin(), setupPath),
      next_steps: nextSteps,
    });
  }
}
