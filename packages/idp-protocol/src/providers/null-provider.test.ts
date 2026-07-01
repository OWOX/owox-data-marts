import { describe, expect, it } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';
import { IdpOperationNotSupportedError } from '../types/errors.js';
import type { Payload } from '../types/models.js';
import { NullIdpProvider } from './null-provider.js';

type CapturedResponse = Response<Payload> & {
  body: unknown;
};

function createJsonResponse(): CapturedResponse {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };

  return res as CapturedResponse;
}

describe('NullIdpProvider user provisioning settings', () => {
  it('returns not applicable settings', async () => {
    const provider = new NullIdpProvider();

    await expect(provider.getUserProvisioningSettings('project-1', 'actor-1')).resolves.toEqual({
      isApplicable: false,
      organization: null,
      settings: null,
    });
  });

  it('throws when updating settings', async () => {
    const provider = new NullIdpProvider();

    await expect(
      provider.updateUserProvisioningSettings('project-1', 'actor-1', {
        mode: 'automatic',
        defaultRole: 'viewer',
      })
    ).rejects.toBeInstanceOf(IdpOperationNotSupportedError);
  });

  it('throws for request-access operations', async () => {
    const provider = new NullIdpProvider();

    await expect(
      provider.getUserProvisioningRequestAccessContext('user-1', 'project-1')
    ).rejects.toBeInstanceOf(IdpOperationNotSupportedError);
    await expect(
      provider.requestProjectAccess('user-1', 'project-1', 'viewer')
    ).rejects.toBeInstanceOf(IdpOperationNotSupportedError);
    await expect(provider.createNewProject('user-1', 'extension-v2')).rejects.toBeInstanceOf(
      IdpOperationNotSupportedError
    );
  });
});

describe('NullIdpProvider project member API keys', () => {
  it('issues a development API-key access token with authFlow and apiKeyId claims', async () => {
    const provider = new NullIdpProvider();

    const result = await provider.issueAccessTokenForProjectMemberApiKey(
      'pmk_AbCdEfGhIjKlMnOpQrStUv',
      'user-1',
      'project-1',
      null,
      false
    );

    await expect(provider.parseToken(result.accessToken)).resolves.toEqual(
      expect.objectContaining({
        userId: 'user-1',
        projectId: 'project-1',
        roles: ['admin'],
        authFlow: 'api_key',
        apiKeyId: 'pmk_AbCdEfGhIjKlMnOpQrStUv',
      })
    );
  });

  it('uses the development member role instead of a stored API-key role', async () => {
    const provider = new NullIdpProvider();

    const result = await provider.issueAccessTokenForProjectMemberApiKey(
      'pmk_AbCdEfGhIjKlMnOpQrStUv',
      'user-1',
      'project-1',
      'viewer',
      false
    );

    await expect(provider.introspectToken(result.accessToken)).resolves.toEqual(
      expect.objectContaining({ roles: ['admin'] })
    );
  });

  it('falls back to refresh-token cookies when authorization header is not an issued API-key token', async () => {
    const provider = new NullIdpProvider();
    const req = {
      cookies: {
        refreshToken: 'refreshToken',
      },
      headers: {
        'x-owox-authorization': 'Bearer unknown-token',
      },
    } as unknown as Request;
    const res = createJsonResponse();

    await provider.userApiMiddleware(req, res, (() => undefined) as NextFunction);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        userId: '0',
        projectId: '0',
        roles: ['admin'],
      })
    );
    expect(res.body).not.toEqual(expect.objectContaining({ authFlow: 'api_key' }));
  });

  it('rejects an authorization header that is not an issued API-key token', async () => {
    const provider = new NullIdpProvider();
    const req = {
      cookies: {},
      headers: {
        'x-owox-authorization': 'Bearer unknown-token',
      },
    } as unknown as Request;
    const res = createJsonResponse();

    await provider.userApiMiddleware(req, res, (() => undefined) as NextFunction);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ message: 'Unauthorized' });
  });
});

describe('NullIdpProvider MCP OAuth', () => {
  it('does not issue MCP OAuth authorization codes or tokens', async () => {
    const provider = new NullIdpProvider();

    await expect(
      provider.createMcpOAuthAuthorizationCode(
        {
          clientId: 'client-1',
          redirectUri: 'https://client.example/callback',
          resource: 'https://mcp.owox.com/mcp',
          scopes: ['mcp:read'],
          state: 'state-1',
          codeChallenge: 'challenge',
          codeChallengeMethod: 'S256',
        },
        {
          userId: 'user-1',
          projectId: 'project-1',
          roles: ['viewer'],
          email: 'user@example.com',
        }
      )
    ).rejects.toBeInstanceOf(IdpOperationNotSupportedError);

    await expect(
      provider.exchangeMcpOAuthToken({
        grantType: 'authorization_code',
        code: 'code-1',
        clientId: 'client-1',
        redirectUri: 'https://client.example/callback',
        resource: 'https://mcp.owox.com/mcp',
        codeVerifier: 'verifier',
      })
    ).rejects.toBeInstanceOf(IdpOperationNotSupportedError);
  });

  it('does not verify MCP access tokens or expose JWKS', async () => {
    const provider = new NullIdpProvider();

    await expect(
      provider.verifyMcpAccessToken('token-1', 'https://mcp.owox.com/mcp', ['mcp:read'])
    ).resolves.toBeNull();
    await expect(provider.getMcpOAuthJwks()).rejects.toBeInstanceOf(IdpOperationNotSupportedError);
  });
});
