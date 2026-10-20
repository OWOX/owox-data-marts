export type McpIntegration = 'claude' | 'chatgpt' | 'owox-data-marts';

/** This is display/creation attribution, not a resumable OAuth authorization. */
export function getMcpIntegration(search: string): McpIntegration | null {
  const integration = new URLSearchParams(search).get('mcp-integration');
  switch (integration) {
    case 'claude':
    case 'chatgpt':
    case 'owox-data-marts':
      return integration;
    default:
      return null;
  }
}

export function getMcpClientName(integration: McpIntegration): string {
  switch (integration) {
    case 'claude':
      return 'Claude';
    case 'chatgpt':
      return 'ChatGPT';
    default:
      return 'your MCP client';
  }
}
