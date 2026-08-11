import { Injectable } from '@nestjs/common';
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

  async getConnectorDetails(
    request: McpConnectorDetailsRequest
  ): Promise<McpConnectorDetailsResponse> {
    const [configFields, nodes, manifest, definitions] = await Promise.all([
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
      // null for a bundled connector (no ConnectorDefinition row) — a correct
      // answer, not an error: bundled connectors have no manifest.
      this.connectorDefinitionService.tryResolveManifest(
        request.projectId,
        request.connector,
        request.version
      ),
      // getConnectorDetails receives a NAME, not an id. Reuses listByProject (the
      // same call listConnectors already makes to tag each row's id) instead of
      // adding a new by-name query — a project's custom connector count is small.
      this.connectorDefinitionService.listByProject(request.projectId),
    ]);
    const connectorId = definitions.find(d => d.name === request.connector)?.id ?? null;
    return {
      name: request.connector,
      connectorId,
      configFields,
      nodes,
      // The manifest is the connector's BODY: author-written JSON that can carry a
      // literal credential, with no SECRET attribute to key masking off. Its REST twin,
      // GET /connectors/custom/:id/versions/:version, is @Auth(Role.editor()) for that
      // reason, and everything in front of this facade checks OAuth SCOPES rather than
      // project roles — a scope records what the client application asked for, so a
      // viewer holding mcp:read would otherwise read here what REST refuses them.
      //
      // Withheld rather than refused outright: configFields and nodes are derived, carry
      // no part of the body, and are what a viewer legitimately needs to understand a
      // connector. Answering with those and a null manifest mirrors the REST split.
      manifest: this.canReadManifest(request.roles) ? manifest : null,
    };
  }

  /**
   * Follows the `editor: ['editor', 'admin']` row of IdpGuard's role hierarchy, the same
   * comparison McpConnectorAuthoringFacadeImpl.assertCanAuthor makes, so the MCP surface
   * and the REST controller withhold the manifest from exactly the same callers.
   */
  private canReadManifest(roles: string[]): boolean {
    return roles.includes('editor') || roles.includes('admin');
  }
}
