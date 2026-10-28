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
import { connectorTargetSchema, connectorPublishedOutputSchema } from './custom-connector.schemas';
import { CustomConnectorToolMapper } from './custom-connector-tool.mapper';

const inputSchema = connectorTargetSchema;
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class PublishCustomConnectorTool implements McpToolDefinition<Input> {
  readonly name = 'publish_custom_connector';
  readonly description =
    'Validate and publish the latest draft, which immediately becomes the active version. You must be an editor with edit access to every Data Mart that follows the active version. If you do not have this access, ask a project admin or request edit access. Publishing changes future runs of Data Marts that follow the active version. Data Marts pinned to a version keep that version.\n\nReview the returned credential warnings with the user. After a conflict, call get_custom_connector again before retrying. Give the user the returned Connector Builder url to open the published connector in OWOX.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = { ...connectorPublishedOutputSchema, url: z.string() };
  readonly annotations = {
    title: 'Publish custom connector',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'editor';
  private readonly mapper = new CustomConnectorToolMapper();

  constructor(
    @Inject(MCP_CUSTOM_CONNECTORS_FACADE) private readonly connectors: McpCustomConnectorsFacade,
    private readonly publicOriginService: PublicOriginService
  ) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = inputSchema.parse(input);
    const result = await this.connectors.publish(context, parsed.connector_id);
    return jsonToolResult({
      ...this.mapper.toPublished(result),
      url: joinPublicOrigin(
        this.publicOriginService.getPublicOrigin(),
        buildConnectorBuilderPath(context.projectId, parsed.connector_id)
      ),
    });
  }
}
