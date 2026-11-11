import type { McpClientIntegration } from '../facades/mcp-client.facade';

/** Acquisition source for a validated MCP OAuth authorization request. */
export function getMcpClientIntegration(redirectUri: string): McpClientIntegration {
  const origin = new URL(redirectUri).origin;
  switch (origin) {
    case 'https://claude.ai':
      return 'claude';
    case 'https://chatgpt.com':
      return 'chatgpt';
    default:
      return 'owox-data-marts';
  }
}
