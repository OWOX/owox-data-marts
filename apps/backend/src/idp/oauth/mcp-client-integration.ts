/** Acquisition source for a validated MCP OAuth authorization request. */
export function getMcpClientIntegration(redirectUri: string): string {
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
