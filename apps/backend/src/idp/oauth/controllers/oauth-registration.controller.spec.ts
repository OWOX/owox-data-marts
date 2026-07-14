import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { McpResourceResolverService } from '../../../mcp-resource/mcp-resource-resolver.service';
import { OAuthClientRegistry } from '../oauth-client.registry';
import { OAuthConfigService } from '../oauth-config.service';
import { OAuthDynamicClientService } from '../oauth-dynamic-client.service';
import { OAuthRegistrationController } from './oauth-registration.controller';

function makeConfig(overrides: Partial<OAuthConfigService> = {}): OAuthConfigService {
  return {
    issuer: 'https://app.owox.com',
    resource: 'https://mcp.owox.com/mcp',
    isDynamicClientRegistrationEnabled: true,
    scopes: ['mcp:read', 'mcp:write'],
    allowedRedirectOrigins: [],
    maxRedirectUris: 10,
    ...overrides,
  } as OAuthConfigService;
}

function makeClientRegistry(): OAuthClientRegistry {
  return new OAuthClientRegistry({
    findOne: jest.fn(),
    save: jest.fn(async client => client),
  } as never);
}

function makeRequest(host = 'mcp.owox.com'): Request {
  return {
    protocol: 'https',
    host,
    headers: { host },
  } as unknown as Request;
}

function makeController(config = makeConfig(), registry = makeClientRegistry()) {
  const resolver = new McpResourceResolverService(
    new ConfigService({
      MCP_PUBLIC_BASE_URL: 'https://mcp.owox.com',
      MCP_OAUTH_RESOURCE: 'https://mcp.owox.com/mcp',
    })
  );
  return {
    controller: new OAuthRegistrationController(
      new OAuthDynamicClientService(config, registry),
      resolver,
      config
    ),
    registry,
  };
}

describe('OAuthRegistrationController', () => {
  it('registers a dynamic public client', async () => {
    const { controller, registry } = makeController();
    const registerSpy = jest.spyOn(registry, 'register');

    const result = await controller.register(
      {
        redirect_uris: ['http://127.0.0.1:5555/callback'],
        client_name: 'Codex',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: 'mcp:read',
      },
      makeRequest()
    );

    expect(result).toEqual(
      expect.objectContaining({
        client_name: 'Codex',
        redirect_uris: ['http://127.0.0.1:5555/callback'],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: 'mcp:read',
      })
    );
    expect(result.client_id).toMatch(/^mcp_dyn_/);
    expect(registerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ resource: 'https://mcp.owox.com/mcp' })
    );
  });

  it('binds a project resource to a client registered on a project MCP host', async () => {
    const projectId = '8c90f0b0f314bf5f5d6f69d24fd7ee3b';
    const { controller, registry } = makeController();
    const registerSpy = jest.spyOn(registry, 'register');

    await controller.register(
      {
        redirect_uris: ['http://127.0.0.1:5555/callback'],
        token_endpoint_auth_method: 'none',
      },
      makeRequest(`${projectId}.mcp.owox.com`)
    );

    expect(registerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ resource: `https://${projectId}.mcp.owox.com/mcp` })
    );
  });

  it('binds shared MCP resource when registration follows canonical authorization-server metadata', async () => {
    const { controller, registry } = makeController();
    const registerSpy = jest.spyOn(registry, 'register');

    await controller.register(
      {
        redirect_uris: ['http://127.0.0.1:5555/callback'],
        token_endpoint_auth_method: 'none',
      },
      makeRequest('app.owox.com')
    );

    expect(registerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ resource: 'https://mcp.owox.com/mcp' })
    );
  });

  it('rejects dynamic registration outside MCP and canonical authorization-server hosts', async () => {
    const { controller } = makeController();

    expect(() =>
      controller.register(
        {
          redirect_uris: ['http://127.0.0.1:5555/callback'],
          token_endpoint_auth_method: 'none',
        },
        makeRequest('example.com')
      )
    ).toThrow('dynamic client registration requires an MCP resource host');
  });

  it('grants all supported scopes by default when registration scope is omitted', async () => {
    const { controller } = makeController(
      makeConfig({ allowedRedirectOrigins: ['https://chatgpt.com'] })
    );

    const result = await controller.register(
      {
        redirect_uris: ['https://chatgpt.com/connector/oauth/callback'],
        client_name: 'ChatGPT',
        token_endpoint_auth_method: 'none',
      },
      makeRequest()
    );

    expect(result.scope).toBe('mcp:read mcp:write');
  });

  it('rejects non-loopback http redirect URIs', async () => {
    const { controller } = makeController();

    await expect(
      controller.register(
        {
          redirect_uris: ['http://example.com/callback'],
          client_name: 'Bad Client',
          token_endpoint_auth_method: 'none',
        },
        makeRequest()
      )
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects external https redirect URIs that are not allowlisted', async () => {
    const { controller } = makeController();

    await expect(
      controller.register(
        {
          redirect_uris: ['https://attacker.test/callback'],
          client_name: 'Bad Client',
          token_endpoint_auth_method: 'none',
        },
        makeRequest()
      )
    ).rejects.toThrow(
      'redirect_uri origin is not allowlisted. Add to MCP_DYNAMIC_CLIENT_ALLOWED_REDIRECT_ORIGINS: https://attacker.test'
    );
  });

  it('accepts external https redirect URIs from allowlisted origins', async () => {
    const { controller } = makeController(
      makeConfig({ allowedRedirectOrigins: ['https://claude.ai'] })
    );

    const result = await controller.register(
      {
        redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
        client_name: 'Claude',
        token_endpoint_auth_method: 'none',
      },
      makeRequest()
    );

    expect(result.redirect_uris).toEqual(['https://claude.ai/api/mcp/auth_callback']);
  });
});
