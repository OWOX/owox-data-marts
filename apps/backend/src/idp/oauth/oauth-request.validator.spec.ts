import { BadRequestException } from '@nestjs/common';
import { OAuthClientRegistry } from './oauth-client.registry';
import { OAuthConfigService } from './oauth-config.service';
import { OAuthRequestValidator } from './oauth-request.validator';

function makeConfig(): OAuthConfigService {
  return {
    resource: 'https://mcp.owox.com/mcp',
    scopes: ['mcp:read', 'mcp:write'],
  } as OAuthConfigService;
}

describe('OAuthRequestValidator', () => {
  let registry: OAuthClientRegistry;
  let validator: OAuthRequestValidator;

  beforeEach(async () => {
    const clients = new Map<string, unknown>();
    const repository = {
      findOne: jest.fn(async ({ where }: { where: { clientId: string } }) => {
        return clients.get(where.clientId) ?? null;
      }),
      save: jest.fn(async (client: { clientId: string }) => {
        clients.set(client.clientId, client);
        return client;
      }),
    };
    registry = new OAuthClientRegistry(repository as never);
    await registry.register({
      clientId: 'mcp_dyn_123',
      clientName: 'Codex',
      redirectUris: ['http://127.0.0.1:5555/callback'],
      scopes: ['mcp:read'],
      createdAt: new Date('2026-06-10T10:00:00.000Z'),
    });
    validator = new OAuthRequestValidator(makeConfig(), registry);
  });

  it('accepts authorization request for registered client and exact redirect URI', async () => {
    const result = await validator.validateAuthorizationRequest({
      response_type: 'code',
      client_id: 'mcp_dyn_123',
      redirect_uri: 'http://127.0.0.1:5555/callback',
      resource: 'https://mcp.owox.com/mcp',
      scope: 'mcp:read',
      state: 'state-1',
      code_challenge: 'challenge',
      code_challenge_method: 'S256',
    });

    expect(result).toEqual({
      clientId: 'mcp_dyn_123',
      redirectUri: 'http://127.0.0.1:5555/callback',
      resource: 'https://mcp.owox.com/mcp',
      scopes: ['mcp:read'],
      state: 'state-1',
      codeChallenge: 'challenge',
      codeChallengeMethod: 'S256',
    });
  });

  it('rejects redirect URI that is not registered exactly', async () => {
    await expect(
      validator.validateAuthorizationRequest({
        response_type: 'code',
        client_id: 'mcp_dyn_123',
        redirect_uri: 'http://127.0.0.1:5555/other',
        resource: 'https://mcp.owox.com/mcp',
        scope: 'mcp:read',
        state: 'state-1',
        code_challenge: 'challenge',
        code_challenge_method: 'S256',
      })
    ).rejects.toThrow(BadRequestException);
  });

  it('maps authorization-code token request from OAuth field names', async () => {
    const result = await validator.validateTokenRequest({
      grant_type: 'authorization_code',
      code: 'code-1',
      client_id: 'mcp_dyn_123',
      redirect_uri: 'http://127.0.0.1:5555/callback',
      resource: 'https://mcp.owox.com/mcp',
      code_verifier: 'verifier',
    });

    expect(result).toEqual({
      grantType: 'authorization_code',
      code: 'code-1',
      clientId: 'mcp_dyn_123',
      redirectUri: 'http://127.0.0.1:5555/callback',
      resource: 'https://mcp.owox.com/mcp',
      codeVerifier: 'verifier',
    });
  });

  it('requires refresh token for refresh grant', async () => {
    await expect(
      validator.validateTokenRequest({
        grant_type: 'refresh_token',
        client_id: 'mcp_dyn_123',
        resource: 'https://mcp.owox.com/mcp',
      })
    ).rejects.toThrow(BadRequestException);
  });
});
