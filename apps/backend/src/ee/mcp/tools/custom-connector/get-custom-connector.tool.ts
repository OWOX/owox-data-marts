import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import { PublicOriginService } from '../../../../common/config/public-origin.service';
import { buildConnectorBuilderPath } from '../data-mart-ui-path';
import { joinPublicOrigin } from '../mcp-public-url.util';
import {
  MCP_CUSTOM_CONNECTORS_FACADE,
  type McpCustomConnectorsFacade,
} from '../../../../data-marts/facades/mcp-custom-connectors.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { connectorTargetSchema, connectorDetailOutputSchema } from './custom-connector.schemas';
import { CustomConnectorToolMapper } from './custom-connector-tool.mapper';

const inputSchema = connectorTargetSchema;
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class GetCustomConnectorTool implements McpToolDefinition<Input> {
  readonly name = 'get_custom_connector';
  readonly description =
    'Read custom connector metadata and all version summaries, with the oldest version first. The result includes a Connector Builder url to open the connector in OWOX. The result does not include manifests. Use list_custom_connectors to find connector_id. As an editor, use get_custom_connector_version to read a draft or published manifest.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = { ...connectorDetailOutputSchema, url: z.string() };
  readonly annotations = {
    title: 'Get custom connector',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly requiredRole: Role = 'viewer';
  private readonly mapper = new CustomConnectorToolMapper();

  constructor(
    @Inject(MCP_CUSTOM_CONNECTORS_FACADE) private readonly connectors: McpCustomConnectorsFacade,
    private readonly publicOriginService: PublicOriginService
  ) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = inputSchema.parse(input);
    const result = await this.connectors.get(context.projectId, parsed.connector_id);
    return jsonToolResult({
      ...this.mapper.toDetail(result),
      url: joinPublicOrigin(
        this.publicOriginService.getPublicOrigin(),
        buildConnectorBuilderPath(context.projectId, result.id)
      ),
    });
  }
}
