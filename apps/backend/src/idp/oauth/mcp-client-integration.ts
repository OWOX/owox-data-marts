import type { McpClientIntegration } from '../facades/mcp-client.facade';

/** Acquisition source for a validated MCP OAuth authorization request. */
export function getMcpClientIntegration(redirectUri: string): McpClientIntegration {
  const origin = new URL(redirectUri).origin;
  switch (origin) {
    case 'https://claude.ai':
      return 'claude';
    case 'https://chatgpt.com':
      return 'chatgpt';
    case 'https://grok.com':
    case 'https://x.ai':
      return 'grok';
    default:
      return 'owox-data-marts';
  }
}
