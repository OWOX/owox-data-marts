export const MCP_CONNECTOR_AUTHORING_FACADE = Symbol('MCP_CONNECTOR_AUTHORING_FACADE');

/**
 * Every request below carries the caller's project `roles`, and the
 * implementation ENFORCES them — they are not decoration. The MCP layer in
 * front of this facade only checks OAuth scopes, which describe what the client
 * application requested rather than who the user is, so role gating has to
 * happen here. Mirroring ConnectorDefinitionController: `listConnectorVersions`
 * is viewer-accessible; `testConnector`, `publishConnector`, `deleteConnector`
 * and `setConnectorVersion` require editor or admin and throw
 * `ForbiddenException` otherwise.
 */

export interface McpTestConnectorRequest {
  projectId: string;
  userId: string;
  roles: string[];
  manifest: Record<string, unknown>;
  node: string;
  configuration?: Record<string, unknown>;
  maxRows?: number;
  maxPages?: number;
}

export interface McpTestConnectorResponse {
  rows: Record<string, unknown>[];
  sample: Record<string, unknown>[];
  error: string | null;
  /**
   * The run's log trail, bounded for the MCP boundary by the implementation.
   *
   * Not optional: a test that matched no records completes with `rows: []` and
   * `error: null`, which reads as a pass. The reason is only ever in here, so a caller
   * that cannot see it cannot tell a working connector from a broken one.
   */
  logs: string[];
}

export interface McpPublishConnectorRequest {
  projectId: string;
  userId: string;
  roles: string[];
  connectorId?: string;
  name?: string;
  title?: string;
  manifest?: Record<string, unknown>;
}

export interface McpPublishConnectorResponse {
  connectorId: string;
  name: string;
  version: number;
  status: string;
  /**
   * The publish-time coverage warnings — parameters that will end up holding a credential
   * in plain text, and SECRET parameters whose default the specification withholds.
   *
   * Carried on the response because the assistant driving `connector_publish` is the
   * author's only view of them: it authored the manifest, it is the one that can correct
   * it, and it never sees the backend log where these used to end. Always an array.
   */
  warnings: string[];
}

export interface McpDeleteConnectorRequest {
  projectId: string;
  userId: string;
  roles: string[];
  connectorId: string;
}

export interface McpDeleteConnectorResponse {
  connectorId: string;
  deleted: true;
}

export interface McpConnectorVersionsRequest {
  projectId: string;
  userId: string;
  roles: string[];
  connectorId: string;
}

export interface McpConnectorVersionItem {
  version: number;
  status: string;
  publishedAt: string | null;
  isActive: boolean;
}

export interface McpConnectorVersionsResponse {
  versions: McpConnectorVersionItem[];
}

export interface McpSetConnectorVersionRequest extends McpConnectorVersionsRequest {
  version: number;
}

export interface McpSetConnectorVersionResponse {
  connectorId: string;
  activeVersion: number;
}

export interface McpConnectorAuthoringFacade {
  testConnector(request: McpTestConnectorRequest): Promise<McpTestConnectorResponse>;
  publishConnector(request: McpPublishConnectorRequest): Promise<McpPublishConnectorResponse>;
  deleteConnector(request: McpDeleteConnectorRequest): Promise<McpDeleteConnectorResponse>;
  listConnectorVersions(
    request: McpConnectorVersionsRequest
  ): Promise<McpConnectorVersionsResponse>;
  setConnectorVersion(
    request: McpSetConnectorVersionRequest
  ): Promise<McpSetConnectorVersionResponse>;
}
