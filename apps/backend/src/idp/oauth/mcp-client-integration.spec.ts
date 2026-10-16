import { getMcpClientIntegration } from './mcp-client-integration';

describe('MCP client acquisition source', () => {
  it.each([
    ['https://claude.ai/api/mcp/auth_callback', 'claude'],
    ['https://chatgpt.com/connector/oauth/callback', 'chatgpt'],
    ['http://127.0.0.1:63782/callback', 'owox-data-marts'],
    ['https://claude.ai.attacker.test/callback', 'owox-data-marts'],
    ['https://claude.ai@attacker.test/callback', 'owox-data-marts'],
    ['http://claude.ai/callback', 'owox-data-marts'],
  ])('attributes %s to %s', (uri, expected) => {
    expect(getMcpClientIntegration(uri)).toBe(expected);
  });
});
