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
import { createConnectorSchema, connectorCreatedOutputSchema } from './custom-connector.schemas';
import { CustomConnectorToolMapper } from './custom-connector-tool.mapper';

const inputSchema = createConnectorSchema;
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class CreateCustomConnectorTool implements McpToolDefinition<Input> {
  readonly name = 'create_custom_connector';
  readonly description =
    'Create a custom connector with its first draft in the connected project. You must be an editor. The connector is not runnable until publish_custom_connector publishes a version.\n\nProvide a unique, immutable name, a title and the complete manifest. Follow https://docs.owox.com/docs/connectors/manifest-reference.llms.txt for the manifest format. Use parameter references for credentials instead of literal secret values. Give the user the returned Connector Builder url to open the draft in OWOX.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = { ...connectorCreatedOutputSchema, url: z.string() };
  readonly annotations = {
    title: 'Create custom connector',
    readOnlyHint: false,
    destructiveHint: false,
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
    const result = await this.connectors.create(context, {
      name: parsed.name,
      title: parsed.title,
      description: parsed.description,
      logo: parsed.logo,
      docUrl: parsed.doc_url,
      manifest: parsed.manifest,
    });
    return jsonToolResult({
      ...this.mapper.toCreated(result),
      url: joinPublicOrigin(
        this.publicOriginService.getPublicOrigin(),
        buildConnectorBuilderPath(context.projectId, result.id)
      ),
    });
  }
}
