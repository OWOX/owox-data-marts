import { Injectable, Logger } from '@nestjs/common';
import { satisfiesRole } from '../../idp/utils/role-hierarchy';
import { ConnectorService } from '../services/connector/connector.service';
import { ConnectorDefinitionService } from '../services/connector/connector-definition.service';
import {
  McpConnectorsFacade,
  McpConnectorRequest,
  McpConnectorDetailsRequest,
  McpConnectorDetailsResponse,
  McpListConnectorsResponse,
  McpMatchConnectorsRequest,
  McpMatchConnectorsResponse,
} from './mcp-connectors.facade';

@Injectable()
export class McpConnectorsFacadeImpl implements McpConnectorsFacade {
  private readonly logger = new Logger(McpConnectorsFacadeImpl.name);

  constructor(
    private readonly connectorService: ConnectorService,
    private readonly connectorDefinitionService: ConnectorDefinitionService
  ) {}

  async listConnectors(request: McpConnectorRequest): Promise<McpListConnectorsResponse> {
    const [bundled, custom] = await Promise.all([
      this.connectorService.getAvailableConnectors(),
      this.connectorDefinitionService.listByProject(request.projectId),
    ]);

    return {
      connectors: [
        ...bundled.map(c => ({
          name: c.name,
          title: c.title,
          description: c.description ?? null,
          kind: 'bundled' as const,
          connectorId: null,
        })),
        ...custom.map(c => ({
          name: c.name,
          title: c.title,
          description: c.description ?? null,
          kind: 'custom' as const,
          connectorId: c.id,
        })),
      ],
    };
  }

  async matchByPrompt(request: McpMatchConnectorsRequest): Promise<McpMatchConnectorsResponse> {
    const { connectors } = await this.listConnectors(request);
    const tokens = request.prompt.toLowerCase().split(/\s+/).filter(Boolean);

    const scored = connectors
      .map(c => {
        const haystack = `${c.name} ${c.title} ${c.description ?? ''}`.toLowerCase();
        const relevanceScore = tokens.filter(t => haystack.includes(t)).length;
        return { ...c, relevanceScore };
      })
      .filter(c => c.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore);

    const limit = request.limit ?? 25;
    return { connectors: scored.slice(0, limit) };
  }

  /**
   * Two audiences, two paths.
   *
   * An AUTHOR (editor or admin) reading their own custom connector gets the version they are
   * working on, draft included, and its manifest. That is the read `connector_publish`'s own
   * description sends them here for — "Read this before updating a connector" — and routing
   * it through the run-path resolver made that first step fail with "has no published version
   * to run" on exactly the case it exists for: a connector fresh from the builder or from
   * `connector_publish`'s own create shape, which has one version and it is a draft.
   *
   * Everyone else keeps the published-only path, unchanged. The manifest is the connector's
   * BODY: author-written JSON that can carry a literal credential, with no SECRET attribute
   * to key masking off. Its REST twin, GET /connectors/custom/:id/versions/:version, is
   * @Auth(Role.editor()) for that reason, and everything in front of this facade checks OAuth
   * SCOPES rather than project roles — a scope records what the client application asked for,
   * so a viewer holding mcp:read would otherwise read here what REST refuses them. Which is
   * also why the draft is on the author's side of the same line rather than a second rule:
   * the role that unlocks the manifest is the role that unlocks the draft, and a viewer sees
   * neither, derived or verbatim.
   *
   * The viewer's half is answered rather than refused: configFields and nodes are derived and
   * are what a viewer legitimately needs to understand a connector, so they come back with a
   * null manifest, mirroring the REST split. "Derived" is not by itself a guarantee that they
   * carry nothing sensitive, and this is the second place to check when one turns up: a
   * SECRET parameter's `default`, `placeholder` and `options` used to travel in configFields
   * verbatim, which handed any holder of `mcp:read` a credential the manifest gate was drawn
   * to protect. ConnectorService.mapConfigFieldToSchema now withholds them for every caller.
   */
  async getConnectorDetails(
    request: McpConnectorDetailsRequest
  ): Promise<McpConnectorDetailsResponse> {
    // getConnectorDetails receives a NAME, not an id. Reuses listByProject (the same call
    // listConnectors already makes to tag each row's id) instead of adding a new by-name
    // query — a project's custom connector count is small.
    const definitions = await this.connectorDefinitionService.listByProject(request.projectId);
    const connectorId = definitions.find(d => d.name === request.connector)?.id ?? null;

    // Null for a bundled connector, which has no ConnectorDefinition row and so no authored
    // version to prefer — a correct answer, not an error.
    const authored =
      connectorId && this.canReadManifest(request.roles)
        ? await this.connectorDefinitionService.resolveAuthoredManifest(
            request.projectId,
            request.connector,
            request.version
          )
        : null;

    if (authored) {
      // One resolve feeds all three fields. The published path reaches the same manifest
      // three times over (spec, fields, and the explicit read), each with its own pair of
      // queries, to answer one question about one version.
      return {
        name: request.connector,
        connectorId,
        ...this.deriveFromManifest(authored),
        manifest: authored,
      };
    }

    const [configFields, nodes] = await Promise.all([
      this.connectorService.resolveConnectorSpecification(
        request.projectId,
        request.connector,
        request.version
      ),
      this.connectorService.resolveConnectorFieldsSchema(
        request.projectId,
        request.connector,
        request.version
      ),
    ]);
    return { name: request.connector, connectorId, configFields, nodes, manifest: null };
  }

  /**
   * The configuration and field schemas a manifest yields, or empty ones when it does not
   * parse.
   *
   * A draft is allowed to be incomplete — that is what a draft IS, and the builder saves one
   * on every edit. Failing the whole read because the parser cannot derive a schema from it
   * would put an author back where this started: told to read the connector before fixing it,
   * and unable to read it. The manifest is the part that is always available, so it is
   * returned with empty derived halves rather than not at all, and publish() stays the
   * authority that refuses the manifest with the parser's own message.
   */
  private deriveFromManifest(manifest: Record<string, unknown>): {
    configFields: unknown[];
    nodes: unknown[];
  } {
    try {
      return {
        configFields: this.connectorService.getSpecificationFromManifest(manifest),
        nodes: this.connectorService.getFieldsSchemaFromManifest(manifest),
      };
    } catch (e) {
      this.logger.debug(
        `Draft manifest does not parse, answering with the manifest alone: ${(e as Error).message}`
      );
      return { configFields: [], nodes: [] };
    }
  }

  /**
   * Goes through the shared `ROLE_HIERARCHY` that IdpGuard applies to
   * `@Auth(Role.editor())`, the same comparison McpConnectorAuthoringFacadeImpl
   * .assertCanAuthor makes, so the MCP surface and the REST controller withhold the
   * manifest from exactly the same callers.
   */
  private canReadManifest(roles: string[]): boolean {
    return satisfiesRole(roles, 'editor');
  }
}
