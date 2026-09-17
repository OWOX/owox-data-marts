export const MCP_CONNECTORS_FACADE = Symbol('MCP_CONNECTORS_FACADE');

export interface McpConnectorRequest {
  projectId: string;
  userId: string;
  roles: string[];
}

export interface McpConnectorListItem {
  name: string;
  title: string;
  description: string | null;
  kind: 'bundled' | 'custom';
  /** The ConnectorDefinition id — what connector_publish (update), connector_delete,
   * connector_versions, and connector_set_version take. Null for bundled connectors,
   * which have no ConnectorDefinition row and cannot be updated, deleted, or versioned. */
  connectorId: string | null;
}

export interface McpListConnectorsResponse {
  connectors: McpConnectorListItem[];
}

export interface McpMatchConnectorsRequest extends McpConnectorRequest {
  prompt: string;
  limit?: number;
}

export interface McpMatchedConnector extends McpConnectorListItem {
  relevanceScore: number;
}

export interface McpMatchConnectorsResponse {
  connectors: McpMatchedConnector[];
}

export interface McpConnectorDetailsRequest extends McpConnectorRequest {
  connector: string;
  version?: number;
}

export interface McpConnectorDetailsResponse {
  name: string;
  /** The ConnectorDefinition id — what connector_publish (update), connector_delete,
   * connector_versions, and connector_set_version take. Null for bundled connectors. */
  connectorId: string | null;
  configFields: unknown[];
  nodes: unknown[];
  /**
   * The connector body. Null for a bundled connector, which has none, and null for a
   * caller without the editor or admin project role — a manifest is author-written JSON
   * that can hold a literal credential, so it is gated exactly as its REST twin
   * (GET /connectors/custom/:id/versions/:version) is.
   */
  manifest: Record<string, unknown> | null;
}

export interface McpConnectorsFacade {
  listConnectors(request: McpConnectorRequest): Promise<McpListConnectorsResponse>;
  matchByPrompt(request: McpMatchConnectorsRequest): Promise<McpMatchConnectorsResponse>;
  getConnectorDetails(request: McpConnectorDetailsRequest): Promise<McpConnectorDetailsResponse>;
}
