import type { McpTokenPayload } from '@owox/idp-protocol';
import type { McpClientFacade } from '../../../idp/facades/mcp-client.facade';
import type { OAuthIdpPort } from '../../../idp/oauth/oauth-idp.port';
import { IdpMcpAuthAdapter } from './idp-mcp-auth.adapter';

describe('IdpMcpAuthAdapter', () => {
  const payload = { clientId: 'client-1', projectId: 'project-1' } as McpTokenPayload;

  const adapterFor = (verified: McpTokenPayload | null) => {
    const clients = { getIntegration: jest.fn().mockResolvedValue('chatgpt') };
    const idp = { verifyMcpToken: jest.fn().mockResolvedValue(verified) };
    return {
      adapter: new IdpMcpAuthAdapter(
        idp as unknown as OAuthIdpPort,
        clients as unknown as McpClientFacade
      ),
      clients,
    };
  };

  it('adds the client integration to a verified token', async () => {
    const { adapter, clients } = adapterFor(payload);
    await expect(adapter.verifyToken('token', 'resource', ['mcp:read'])).resolves.toEqual({
      ...payload,
      integration: 'chatgpt',
    });
    expect(clients.getIntegration).toHaveBeenCalledWith('client-1');
  });

  it('returns null for a rejected token without a client lookup', async () => {
    const { adapter, clients } = adapterFor(null);
    await expect(adapter.verifyToken('token', 'resource', ['mcp:read'])).resolves.toBeNull();
    expect(clients.getIntegration).not.toHaveBeenCalled();
  });
});
