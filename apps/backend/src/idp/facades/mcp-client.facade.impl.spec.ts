import type { OAuthClientRegistry } from '../oauth/oauth-client.registry';
import { McpClientFacadeImpl } from './mcp-client.facade.impl';

describe('McpClientFacadeImpl', () => {
  const facadeFor = (redirectUris?: string[]) =>
    new McpClientFacadeImpl({
      get: jest.fn().mockResolvedValue(redirectUris && { clientId: 'client-1', redirectUris }),
    } as unknown as OAuthClientRegistry);

  it.each([
    [['https://chatgpt.com/connector_platform_oauth_redirect'], 'chatgpt'],
    [['http://localhost:6274/callback', 'https://claude.ai/api/mcp/auth_callback'], 'claude'],
    [['http://localhost:6274/callback'], 'owox-data-marts'],
  ])('reads %j as %s', async (redirectUris, integration) => {
    await expect(facadeFor(redirectUris).getIntegration('client-1')).resolves.toBe(integration);
  });

  it('treats an unknown client as owox-data-marts', async () => {
    await expect(facadeFor().getIntegration('client-1')).resolves.toBe('owox-data-marts');
  });
});
