export const MCP_CONNECTOR_RUN_FACADE = Symbol('MCP_CONNECTOR_RUN_FACADE');

export interface McpRunConnectorDataMartRequest {
  projectId: string;
  userId: string;
  roles: string[];
  dataMartId: string;
}

export interface McpRunConnectorDataMartResult {
  runId: string;
  status: 'PENDING';
}

export interface McpGetRunStatusRequest {
  projectId: string;
  userId: string;
  roles: string[];
  dataMartId: string;
  runId: string;
}

export interface McpGetRunStatusResult {
  runId: string;
  dataMartId: string;
  status: string;
  runType: string;
  startedAt: string | null;
  finishedAt: string | null;
  lastLogs: string[];
  errors: string[];
}

export interface McpConnectorRunFacade {
  runConnectorDataMart(
    request: McpRunConnectorDataMartRequest
  ): Promise<McpRunConnectorDataMartResult>;
  getConnectorRunStatus(request: McpGetRunStatusRequest): Promise<McpGetRunStatusResult>;
}
