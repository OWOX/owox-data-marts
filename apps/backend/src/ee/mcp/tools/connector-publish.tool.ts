import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import { PublicOriginService } from '../../../common/config/public-origin.service';
import {
  MCP_CONNECTOR_AUTHORING_FACADE,
  type McpConnectorAuthoringFacade,
} from '../../../data-marts/facades/mcp-connector-authoring.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';
import { joinPublicOrigin } from './mcp-public-url.util';
import { buildConnectorBuilderPath } from './data-mart-ui-path';

/**
 * `name` and `title` are stored in `varchar` columns, TypeORM's default length. The HTTP
 * body bounds them with `@MaxLength(255)` (CreateCustomConnectorRequestApiDto); this schema
 * is the other way into the same columns and has to agree, or the same value refused over
 * HTTP is written over MCP and hits ER_DATA_TOO_LONG -- or a silent truncation -- on MySQL.
 * The name's regex is no help: `[A-Za-z][A-Za-z0-9_]*` has no upper bound.
 *
 * The manifest's own ceiling is not expressed here on purpose: it is a BYTE budget measured
 * against the kernel's MAX_ARG_STRLEN, and ConnectorDefinitionService enforces it on
 * create()/saveDraft(), which is the one place both entrances pass through.
 */
const MAX_VARCHAR_LENGTH = 255;

// The raw shape (exposed to MCP clients) has every field optional; the parsed
// schema additionally enforces the three valid shapes via refine, since mixing
// or omitting fields is a caller mistake worth surfacing.
const baseInputSchema = z
  .object({
    connector_id: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Publish an existing connector: with manifest, as a new version; alone, its existing draft'
      ),
    name: z
      .string()
      .regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Start with a letter; letters, digits, underscore only')
      .max(MAX_VARCHAR_LENGTH)
      .optional()
      .describe('Machine name for a new connector (create-and-publish)'),
    title: z
      .string()
      .trim()
      .min(1)
      .max(MAX_VARCHAR_LENGTH)
      .optional()
      .describe('Display title for a new connector'),
    manifest: z.record(z.unknown()).optional().describe('The manifest for a new connector'),
  })
  .strict();

const inputSchema = baseInputSchema.refine(
  d => {
    const createShape = !d.connector_id && !!d.name && !!d.title && !!d.manifest;
    const updateShape = !!d.connector_id && !d.name && !d.title && !!d.manifest;
    const publishDraftShape = !!d.connector_id && !d.name && !d.title && !d.manifest;
    return createShape || updateShape || publishDraftShape;
  },
  {
    message:
      'Provide name+title+manifest (create and publish), connector_id+manifest (publish a new version of an existing connector), or connector_id alone (publish its existing draft).',
  }
);

type PublishConnectorInput = z.infer<typeof inputSchema>;

@Injectable()
export class ConnectorPublishTool implements McpToolDefinition<PublishConnectorInput> {
  readonly name = 'connector_publish';
  readonly description =
    'Save and publish a custom connector. Provide name + title + manifest to create and publish a new one, connector_id + manifest to publish a new version of an existing connector, or connector_id alone to publish its existing draft. Read the current manifest first with connector_details. Returns the connector id, name, version, and status. Also returns `url`, a link to the connector in the builder — give it to the user so they can open it and test the connector with their own credentials.';
  readonly zodSchema = baseInputSchema.shape;
  readonly outputSchema = {
    connector_id: z.string(),
    name: z.string(),
    version: z.number(),
    status: z.string(),
    url: z.string(),
  };
  readonly annotations = {
    title: 'Connector Publish',
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];

  constructor(
    @Inject(MCP_CONNECTOR_AUTHORING_FACADE)
    private readonly authoring: McpConnectorAuthoringFacade,
    private readonly publicOriginService: PublicOriginService
  ) {}

  parseInput(input: unknown): PublishConnectorInput {
    return inputSchema.parse(input);
  }

  async handler(input: PublishConnectorInput, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const result = await this.authoring.publishConnector({
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
      connectorId: parsed.connector_id,
      name: parsed.name,
      title: parsed.title,
      manifest: parsed.manifest,
    });
    return jsonToolResult({
      connector_id: result.connectorId,
      name: result.name,
      version: result.version,
      status: result.status,
      url: joinPublicOrigin(
        this.publicOriginService.getPublicOrigin(),
        buildConnectorBuilderPath(context.projectId, result.connectorId)
      ),
    });
  }
}
