import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import { PublicOriginService } from '../../../../common/config/public-origin.service';
import {
  DataMartDefinitionType,
  MCP_DATA_MART_SETUP_FACADE,
  type McpDataMartSetupFacade,
} from '../../../../data-marts/facades/mcp-data-mart-setup.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { buildDataMartUiPath } from '../data-mart-ui-path';
import { joinPublicOrigin } from '../mcp-public-url.util';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import {
  dataMartTargetShape,
  dataMartConfigurationOutput,
} from './data-mart-configuration.schemas';
const inputSchema = z.object({ ...dataMartTargetShape }).strict();
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class GetDataMartConfigurationTool implements McpToolDefinition<Input> {
  readonly name = 'get_data_mart_configuration';
  readonly description =
    'Read the complete saved configuration of a draft or published Data Mart before editing it. Includes its definition, full schema, contexts, owners, sharing, blended fields, setup_url and actionable next_steps. Connector secrets are masked; storage credentials and connector runtime state are omitted. Uses the same project and resource access checks as the API. For new credentials or spreadsheet selection, the user opens setup_url and saves setup in the web app; after user confirmation, reread this configuration and list_connector_configurations for this same Data Mart, then validate the saved definition before continuing. A saved connector definition does not establish working authentication or validity.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    ...dataMartConfigurationOutput,
    setup_url: z
      .string()
      .describe('Web app setup URL for this saved Data Mart in the connected project.'),
    next_steps: z
      .array(z.string())
      .min(1)
      .describe(
        'Actions based on the saved definition; setup and authentication still require validation.'
      ),
  };
  readonly annotations = {
    title: 'Get Data Mart Configuration',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];

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
    const result = await this.facade.getDataMart(ctx, { dataMartId: parsed.data_mart_id });
    const nextSteps: string[] = [];
    if (result.definitionType === null || result.definition === null) {
      nextSteps.push(
        'No source definition has been saved. Configure it with update_data_mart_definition or open setup_url for connector authentication or source spreadsheet selection with the picker, then save setup in the web app.'
      );
    } else if (result.definitionType === DataMartDefinitionType.CONNECTOR) {
      nextSteps.push(
        'Inspect the saved connector definition. A saved definition does not establish that connector authentication or source access works.',
        'Call list_connector_configurations with connector_name from the saved connector.source.name; use only configurations whose data_mart_id matches this same Data Mart. If authentication or spreadsheet selection is needed, open setup_url, have the user authenticate or use the picker, then save setup in the web app.'
      );
    } else {
      nextSteps.push('Review the saved source definition before editing or validating it.');
    }
    if (
      result.definitionType === null ||
      result.definition === null ||
      result.definitionType === DataMartDefinitionType.CONNECTOR
    ) {
      nextSteps.push(
        `After UI setup, wait for the user to confirm it was saved. Then call get_data_mart_configuration with data_mart_id ${JSON.stringify(result.id)} and list_connector_configurations for the connector; select only configurations from this same Data Mart.`
      );
    }
    nextSteps.push(
      `Validate the saved definition with validate_data_mart_definition for data_mart_id ${JSON.stringify(result.id)} before continuing with schema actualization or publishing. Saving setup does not establish that the definition is valid.`
    );
    return jsonToolResult({
      data_mart: result,
      setup_url: joinPublicOrigin(
        this.publicOriginService.getPublicOrigin(),
        buildDataMartUiPath(context.projectId, result.id)
      ),
      next_steps: nextSteps,
    });
  }
}
