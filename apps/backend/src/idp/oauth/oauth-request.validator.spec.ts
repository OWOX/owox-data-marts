import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { McpResourceResolverService } from '../../mcp-resource/mcp-resource-resolver.service';
import { OAuthClientRegistry } from './oauth-client.registry';
import { OAuthConfigService } from './oauth-config.service';
import { OAuthRequestValidator } from './oauth-request.validator';

function makeServices(): {
  config: OAuthConfigService;
  resourceResolver: McpResourceResolverService;
} {
  const configService = new ConfigService({
    MCP_PUBLIC_BASE_URL: 'https://mcp.owox.com',
    MCP_OAUTH_RESOURCE: 'https://mcp.owox.com/mcp',
    OWOX_AUTH_PUBLIC_BASE_URL: 'https://app.owox.com',
  });

  return {
    config: new OAuthConfigService(configService),
    resourceResolver: new McpResourceResolverService(configService),
  };
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
      resource: 'https://mcp.owox.com/mcp',
      redirectUris: ['http://127.0.0.1:5555/callback'],
      scopes: ['mcp:read'],
      createdAt: new Date('2026-06-10T10:00:00.000Z'),
    });
    const { config, resourceResolver } = makeServices();
    validator = new OAuthRequestValidator(config, registry, resourceResolver);
  });

  it('accepts authorization request for registered client and exact redirect URI', async () => {
    const result = await validator.validateAuthorizationRequest(
      {
        response_type: 'code',
        client_id: 'mcp_dyn_123',
        redirect_uri: 'http://127.0.0.1:5555/callback',
        scope: 'mcp:read',
        state: 'state-1',
        code_challenge: 'challenge',
        code_challenge_method: 'S256',
      },
      'https://mcp.owox.com/mcp'
    );

    expect(result).toEqual({
      request: {
        clientId: 'mcp_dyn_123',
        redirectUri: 'http://127.0.0.1:5555/callback',
        resource: 'https://mcp.owox.com/mcp',
        scopes: ['mcp:read'],
        state: 'state-1',
        codeChallenge: 'challenge',
        codeChallengeMethod: 'S256',
      },
      resourceContext: {
        kind: 'shared',
        resource: 'https://mcp.owox.com/mcp',
        publicBaseUrl: 'https://mcp.owox.com',
        projectId: null,
      },
    });
  });

  it('accepts authorization request for project-specific request MCP resource', async () => {
    const projectId = '8c90f0b0f314bf5f5d6f69d24fd7ee3b';
    await registry.register({
      clientId: 'mcp_dyn_project',
      resource: `https://${projectId}.mcp.owox.com/mcp`,
      redirectUris: ['http://127.0.0.1:5555/callback'],
      scopes: ['mcp:read'],
      createdAt: new Date('2026-06-10T10:00:00.000Z'),
    });
    const result = await validator.validateAuthorizationRequest(
      {
        response_type: 'code',
        client_id: 'mcp_dyn_project',
        redirect_uri: 'http://127.0.0.1:5555/callback',
        scope: 'mcp:read',
        state: 'state-1',
        code_challenge: 'challenge',
        code_challenge_method: 'S256',
      },
      `https://${projectId}.mcp.owox.com/mcp`
    );

    expect(result).toMatchObject({
      request: {
        resource: `https://${projectId}.mcp.owox.com/mcp`,
      },
      resourceContext: {
        kind: 'project',
        projectId,
      },
    });
  });

  it('uses registered project resource on the app authorization host', async () => {
    const projectId = '8c90f0b0f314bf5f5d6f69d24fd7ee3b';
    await registry.register({
      clientId: 'mcp_dyn_project',
      resource: `https://${projectId}.mcp.owox.com/mcp`,
      redirectUris: ['http://127.0.0.1:5555/callback'],
      scopes: ['mcp:read'],
      createdAt: new Date('2026-06-10T10:00:00.000Z'),
    });
    const result = await validator.validateAuthorizationRequest({
      response_type: 'code',
      client_id: 'mcp_dyn_project',
      redirect_uri: 'http://127.0.0.1:5555/callback',
      scope: 'mcp:read',
      state: 'state-1',
      code_challenge: 'challenge',
      code_challenge_method: 'S256',
    });

    expect(result).toMatchObject({
      request: {
        resource: `https://${projectId}.mcp.owox.com/mcp`,
      },
      resourceContext: {
        kind: 'project',
        projectId,
      },
    });
  });

  it('accepts authorization requests with matching resource explicitly', async () => {
    await expect(
      validator.validateAuthorizationRequest(
        {
          response_type: 'code',
          client_id: 'mcp_dyn_123',
          redirect_uri: 'http://127.0.0.1:5555/callback',
          resource: 'https://mcp.owox.com/mcp',
          scope: 'mcp:read',
          state: 'state-1',
          code_challenge: 'challenge',
          code_challenge_method: 'S256',
        },
        'https://mcp.owox.com/mcp'
      )
    ).resolves.toMatchObject({ request: { resource: 'https://mcp.owox.com/mcp' } });
  });

  it('rejects authorization requests with resource from another registered client', async () => {
    await expect(
      validator.validateAuthorizationRequest({
        response_type: 'code',
        client_id: 'mcp_dyn_123',
        redirect_uri: 'http://127.0.0.1:5555/callback',
        resource: 'https://8c90f0b0f314bf5f5d6f69d24fd7ee3b.mcp.owox.com/mcp',
        scope: 'mcp:read',
        state: 'state-1',
        code_challenge: 'challenge',
        code_challenge_method: 'S256',
      })
    ).rejects.toThrow('resource does not match registered client');
  });

  it('rejects redirect URI that is not registered exactly', async () => {
    await expect(
      validator.validateAuthorizationRequest(
        {
          response_type: 'code',
          client_id: 'mcp_dyn_123',
          redirect_uri: 'http://127.0.0.1:5555/other',
          scope: 'mcp:read',
          state: 'state-1',
          code_challenge: 'challenge',
          code_challenge_method: 'S256',
        },
        'https://mcp.owox.com/mcp'
      )
    ).rejects.toThrow(BadRequestException);
  });

  it('maps authorization-code token request from OAuth field names', async () => {
    const result = await validator.validateTokenRequest(
      {
        grant_type: 'authorization_code',
        code: 'code-1',
        client_id: 'mcp_dyn_123',
        redirect_uri: 'http://127.0.0.1:5555/callback',
        code_verifier: 'verifier',
      },
      'https://mcp.owox.com/mcp'
    );

    expect(result).toEqual({
      request: {
        grantType: 'authorization_code',
        code: 'code-1',
        clientId: 'mcp_dyn_123',
        redirectUri: 'http://127.0.0.1:5555/callback',
        resource: 'https://mcp.owox.com/mcp',
        codeVerifier: 'verifier',
      },
      resourceContext: {
        kind: 'shared',
        resource: 'https://mcp.owox.com/mcp',
        publicBaseUrl: 'https://mcp.owox.com',
        projectId: null,
      },
    });
  });

  it('uses registered project resource for authorization-code token requests', async () => {
    const projectId = '8c90f0b0f314bf5f5d6f69d24fd7ee3b';
    await registry.register({
      clientId: 'mcp_dyn_project',
      resource: `https://${projectId}.mcp.owox.com/mcp`,
      redirectUris: ['http://127.0.0.1:5555/callback'],
      scopes: ['mcp:read'],
      createdAt: new Date('2026-06-10T10:00:00.000Z'),
    });
    const result = await validator.validateTokenRequest(
      {
        grant_type: 'authorization_code',
        code: 'code-1',
        client_id: 'mcp_dyn_project',
        redirect_uri: 'http://127.0.0.1:5555/callback',
        code_verifier: 'verifier',
      },
      `https://${projectId}.mcp.owox.com/mcp`
    );

    expect(result).toMatchObject({
      request: {
        resource: `https://${projectId}.mcp.owox.com/mcp`,
      },
      resourceContext: {
        kind: 'project',
        projectId,
      },
    });
  });

  it('accepts authorization-code token requests that provide matching resource', async () => {
    await expect(
      validator.validateTokenRequest(
        {
          grant_type: 'authorization_code',
          code: 'code-1',
          client_id: 'mcp_dyn_123',
          redirect_uri: 'http://127.0.0.1:5555/callback',
          resource: 'https://mcp.owox.com/mcp',
          code_verifier: 'verifier',
        },
        'https://mcp.owox.com/mcp'
      )
    ).resolves.toMatchObject({ request: { resource: 'https://mcp.owox.com/mcp' } });
  });

  it('rejects token requests that provide a resource from another registered client', async () => {
    await expect(
      validator.validateTokenRequest(
        {
          grant_type: 'authorization_code',
          code: 'code-1',
          client_id: 'mcp_dyn_123',
          redirect_uri: 'http://127.0.0.1:5555/callback',
          resource: 'https://8c90f0b0f314bf5f5d6f69d24fd7ee3b.mcp.owox.com/mcp',
          code_verifier: 'verifier',
        },
        'https://mcp.owox.com/mcp'
      )
    ).rejects.toThrow('resource does not match registered client');
  });

  it('uses registered MCP resource for refresh-token requests', async () => {
    const result = await validator.validateTokenRequest(
      {
        grant_type: 'refresh_token',
        refresh_token: 'refresh-1',
        client_id: 'mcp_dyn_123',
      },
      'https://mcp.owox.com/mcp'
    );

    expect(result).toEqual({
      request: {
        grantType: 'refresh_token',
        refreshToken: 'refresh-1',
        clientId: 'mcp_dyn_123',
        resource: 'https://mcp.owox.com/mcp',
      },
      resourceContext: {
        kind: 'shared',
        resource: 'https://mcp.owox.com/mcp',
        publicBaseUrl: 'https://mcp.owox.com',
        projectId: null,
      },
    });
  });

  it('accepts refresh-token requests that provide matching resource', async () => {
    await expect(
      validator.validateTokenRequest(
        {
          grant_type: 'refresh_token',
          refresh_token: 'refresh-1',
          client_id: 'mcp_dyn_123',
          resource: 'https://mcp.owox.com/mcp',
        },
        'https://mcp.owox.com/mcp'
      )
    ).resolves.toMatchObject({ request: { resource: 'https://mcp.owox.com/mcp' } });
  });

  it('rejects clients created before resource binding was introduced', async () => {
    await registry.register({
      clientId: 'mcp_dyn_legacy',
      redirectUris: ['http://127.0.0.1:5555/callback'],
      scopes: ['mcp:read'],
      createdAt: new Date('2026-06-10T10:00:00.000Z'),
    });

    await expect(
      validator.validateAuthorizationRequest({
        response_type: 'code',
        client_id: 'mcp_dyn_legacy',
        redirect_uri: 'http://127.0.0.1:5555/callback',
        scope: 'mcp:read',
        state: 'state-1',
        code_challenge: 'challenge',
        code_challenge_method: 'S256',
      })
    ).rejects.toThrow('client is not bound to an MCP resource');
  });

  it('requires refresh token for refresh grant', async () => {
    await expect(
      validator.validateTokenRequest(
        {
          grant_type: 'refresh_token',
          client_id: 'mcp_dyn_123',
        },
        'https://mcp.owox.com/mcp'
      )
    ).rejects.toThrow(BadRequestException);
  });
});
