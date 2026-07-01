export const MCP_DATA_MARTS_FACADE = Symbol('MCP_DATA_MARTS_FACADE');

export interface McpListDataMartsRequest {
  projectId: string;
  userId: string;
  roles: string[];
}

export interface McpDataMartListItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  updatedAt: string;
}

export interface McpListDataMartsResponse {
  dataMarts: McpDataMartListItem[];
}

export interface McpDataMartsFacade {
  listDataMarts(request: McpListDataMartsRequest): Promise<McpListDataMartsResponse>;
}
