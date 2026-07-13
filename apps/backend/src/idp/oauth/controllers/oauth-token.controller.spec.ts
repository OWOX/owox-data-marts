import type { Request } from 'express';
import { McpResourceResolverService } from '../../../mcp-resource/mcp-resource-resolver.service';
import { OAuthIdpPort, OAUTH_IDP_PORT } from '../oauth-idp.port';
import { OAuthClientRegistry } from '../oauth-client.registry';
import { OAuthRequestValidator } from '../oauth-request.validator';
import { OAuthTokenController } from './oauth-token.controller';

describe('OAuthTokenController', () => {
  function createController(validatedRequest: Record<string, unknown>) {
    const validator = {
      validateTokenRequest: jest.fn().mockResolvedValue({
        request: validatedRequest,
        resourceContext: {
          kind: 'shared',
          resource: validatedRequest.resource,
          publicBaseUrl: 'https://mcp.owox.com',
          projectId: null,
        },
      }),
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
    const resourceResolver = {
      tryResolveRequest: jest.fn().mockReturnValue({
        kind: 'shared',
        resource: 'https://mcp.owox.com/mcp',
        publicBaseUrl: 'https://mcp.owox.com',
        projectId: null,
      }),
    } as unknown as jest.Mocked<McpResourceResolverService>;
    const controller = new OAuthTokenController(validator, idp, clientRegistry, resourceResolver);

    return { controller, validator, idp, clientRegistry, resourceResolver };
  }

  it('validates request, returns OAuth token response, and marks client successful', async () => {
    const { controller, validator, idp, clientRegistry, resourceResolver } = createController({
      grantType: 'authorization_code',
      code: 'code-1',
      clientId: 'client-1',
      redirectUri: 'https://client.example/callback',
      resource: 'https://mcp.owox.com/mcp',
      codeVerifier: 'verifier',
    });
    const body = {
      grant_type: 'authorization_code',
      code: 'code-1',
      client_id: 'client-1',
      redirect_uri: 'https://client.example/callback',
      code_verifier: 'verifier',
    };
    const request = {} as Request;

    const result = await controller.token(body, request);

    expect(resourceResolver.tryResolveRequest).toHaveBeenCalledWith(request);
    expect(validator.validateTokenRequest).toHaveBeenCalledWith(body, 'https://mcp.owox.com/mcp');
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

    await controller.token(
      {
        grant_type: 'refresh_token',
        refresh_token: 'refresh-token',
        client_id: 'client-1',
      },
      {} as Request
    );

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
      controller.token(
        {
          grant_type: 'authorization_code',
          code: 'code-1',
          client_id: 'client-1',
          redirect_uri: 'https://client.example/callback',
          code_verifier: 'verifier',
        },
        {} as Request
      )
    ).rejects.toThrow('token exchange failed');

    expect(clientRegistry.markSuccessfulTokenExchange).not.toHaveBeenCalled();
  });

  it('exports a stable OAuth IDP injection token', () => {
    expect(OAUTH_IDP_PORT).toBeDefined();
  });
});
