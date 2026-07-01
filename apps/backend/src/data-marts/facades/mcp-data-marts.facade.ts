export const MCP_DATA_MARTS_FACADE = Symbol('MCP_DATA_MARTS_FACADE');

export interface McpListDataMartsRequest {
  projectId: string;
  userId: string;
  roles: string[];
}

export interface McpGetDataMartDetailsRequest extends McpListDataMartsRequest {
  dataMartId: string;
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

export interface McpDataMartDetailsResponse {
  id: string;
  name: string;
  description: string;
  fields: Array<Record<string, unknown>>;
}

export interface McpDataMartsFacade {
  listDataMarts(request: McpListDataMartsRequest): Promise<McpListDataMartsResponse>;
  getDataMartDetails(request: McpGetDataMartDetailsRequest): Promise<McpDataMartDetailsResponse>;
}
