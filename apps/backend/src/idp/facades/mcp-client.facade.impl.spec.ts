import type { OAuthClientRegistry } from '../oauth/oauth-client.registry';
import { McpClientFacadeImpl } from './mcp-client.facade.impl';

describe('McpClientFacadeImpl', () => {
  const registryFor = (redirectUris?: string[]) => ({
    get: jest.fn().mockResolvedValue(redirectUris && { clientId: 'client-1', redirectUris }),
  });
  const facadeFor = (registry: ReturnType<typeof registryFor>) =>
    new McpClientFacadeImpl(registry as unknown as OAuthClientRegistry);

  it.each([
    [['https://chatgpt.com/connector_platform_oauth_redirect'], 'chatgpt'],
    [['http://localhost:6274/callback', 'https://claude.ai/api/mcp/auth_callback'], 'claude'],
    [['http://localhost:6274/callback'], 'owox-data-marts'],
  ])('reads %j as %s', async (redirectUris, integration) => {
    const registry = registryFor(redirectUris);
    await expect(facadeFor(registry).getIntegration('client-1')).resolves.toBe(integration);
    expect(registry.get).toHaveBeenCalledWith('client-1');
  });

  it('treats an unknown client as owox-data-marts', async () => {
    await expect(facadeFor(registryFor()).getIntegration('client-1')).resolves.toBe(
      'owox-data-marts'
    );
  });

  it('reads the registry once per client', async () => {
    const registry = registryFor(['https://chatgpt.com/connector_platform_oauth_redirect']);
    const facade = facadeFor(registry);
    await facade.getIntegration('client-1');
    await expect(facade.getIntegration('client-1')).resolves.toBe('chatgpt');
    expect(registry.get).toHaveBeenCalledTimes(1);
  });
});
