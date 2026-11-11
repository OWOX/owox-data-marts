export const MCP_CLIENT_FACADE = Symbol('MCP_CLIENT_FACADE');

export type McpClientIntegration = 'claude' | 'chatgpt' | 'owox-data-marts';

export interface McpClientFacade {
  /** The AI client that registered this OAuth client, read from its redirect URIs. */
  getIntegration(clientId: string): Promise<McpClientIntegration>;
}
