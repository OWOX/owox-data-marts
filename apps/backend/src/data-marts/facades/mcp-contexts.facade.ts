export const MCP_CONTEXTS_FACADE = Symbol('MCP_CONTEXTS_FACADE');

export interface McpContextSummary {
  id: string;
  name: string;
}
export interface McpContext extends McpContextSummary {
  description: string | null;
}

export interface McpContextsFacade {
  listContexts(projectId: string): Promise<McpContext[]>;
  validateContextIds(projectId: string, contextIds: string[]): Promise<void>;
  getDataMartContexts(
    projectId: string,
    dataMartIds: string[]
  ): Promise<Record<string, McpContextSummary[]>>;
}
