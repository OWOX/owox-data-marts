import { OAuthIdpPort, OAUTH_IDP_PORT } from '../oauth-idp.port';
import { OAuthClientRegistry } from '../oauth-client.registry';
import { OAuthRequestValidator } from '../oauth-request.validator';
import { OAuthTokenController } from './oauth-token.controller';

describe('OAuthTokenController', () => {
  function createController(validatedRequest: Record<string, unknown>) {
    const validator = {
      validateTokenRequest: jest.fn().mockResolvedValue(validatedRequest),
    } as unknown as jest.Mocked<OAuthRequestValidator>;
    const idp = {
      exchangeToken: jest.fn().mockResolvedValue({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        token_type: 'Bearer',
        expires_in: 900,
        scope: 'mcp:read',
      }),
    } as unknown as jest.Mocked<OAuthIdpPort>;
    const clientRegistry = {
      markSuccessfulTokenExchange: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<OAuthClientRegistry>;
    const controller = new (OAuthTokenController as unknown as new (
      ...args: unknown[]
    ) => OAuthTokenController)(validator, idp, clientRegistry);

    return { controller, validator, idp, clientRegistry };
  }

  it('validates request, returns OAuth token response, and marks client successful', async () => {
    const { controller, validator, idp, clientRegistry } = createController({
      grantType: 'authorization_code',
      code: 'code-1',
      clientId: 'client-1',
      redirectUri: 'https://client.example/callback',
      resource: 'https://mcp.owox.com/mcp',
      codeVerifier: 'verifier',
    });

    const result = await controller.token({
      grant_type: 'authorization_code',
      code: 'code-1',
      client_id: 'client-1',
      redirect_uri: 'https://client.example/callback',
      resource: 'https://mcp.owox.com/mcp',
      code_verifier: 'verifier',
    });

    expect(validator.validateTokenRequest).toHaveBeenCalledWith({
      grant_type: 'authorization_code',
      code: 'code-1',
      client_id: 'client-1',
      redirect_uri: 'https://client.example/callback',
      resource: 'https://mcp.owox.com/mcp',
      code_verifier: 'verifier',
    });
    expect(idp.exchangeToken).toHaveBeenCalledWith({
      grantType: 'authorization_code',
      code: 'code-1',
      clientId: 'client-1',
      redirectUri: 'https://client.example/callback',
      resource: 'https://mcp.owox.com/mcp',
      codeVerifier: 'verifier',
    });
    expect(clientRegistry.markSuccessfulTokenExchange).toHaveBeenCalledWith('client-1');
    expect(result).toEqual({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      token_type: 'Bearer',
      expires_in: 900,
      scope: 'mcp:read',
    });
  });

  it('marks client used after successful refresh token exchange', async () => {
    const { controller, clientRegistry } = createController({
      grantType: 'refresh_token',
      refreshToken: 'refresh-token',
      clientId: 'client-1',
      resource: 'https://mcp.owox.com/mcp',
    });

    await controller.token({
      grant_type: 'refresh_token',
      refresh_token: 'refresh-token',
      client_id: 'client-1',
      resource: 'https://mcp.owox.com/mcp',
    });

    expect(clientRegistry.markSuccessfulTokenExchange).toHaveBeenCalledWith('client-1');
  });

  it('does not mark client used when token exchange fails', async () => {
    const { controller, idp, clientRegistry } = createController({
      grantType: 'authorization_code',
      code: 'code-1',
      clientId: 'client-1',
      redirectUri: 'https://client.example/callback',
      resource: 'https://mcp.owox.com/mcp',
      codeVerifier: 'verifier',
    });
    idp.exchangeToken.mockRejectedValueOnce(new Error('token exchange failed'));

    await expect(
      controller.token({
        grant_type: 'authorization_code',
        code: 'code-1',
        client_id: 'client-1',
        redirect_uri: 'https://client.example/callback',
        resource: 'https://mcp.owox.com/mcp',
        code_verifier: 'verifier',
      })
    ).rejects.toThrow('token exchange failed');

    expect(clientRegistry.markSuccessfulTokenExchange).not.toHaveBeenCalled();
  });

  it('exports a stable OAuth IDP injection token', () => {
    expect(OAUTH_IDP_PORT).toBeDefined();
  });
});
