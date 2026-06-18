import { BadRequestException } from '@nestjs/common';
import { OAuthClientRegistry } from '../oauth-client.registry';
import { OAuthConfigService } from '../oauth-config.service';
import { OAuthDynamicClientService } from '../oauth-dynamic-client.service';
import { OAuthRegistrationController } from './oauth-registration.controller';

function makeConfig(overrides: Partial<OAuthConfigService> = {}): OAuthConfigService {
  return {
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

describe('OAuthRegistrationController', () => {
  it('registers a dynamic public client', async () => {
    const service = new OAuthDynamicClientService(makeConfig(), makeClientRegistry());
    const controller = new OAuthRegistrationController(service);

    const result = await controller.register({
      redirect_uris: ['http://127.0.0.1:5555/callback'],
      client_name: 'Codex',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'mcp:read',
    });

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
  });

  it('grants all supported scopes by default when registration scope is omitted', async () => {
    const service = new OAuthDynamicClientService(
      makeConfig({ allowedRedirectOrigins: ['https://chatgpt.com'] }),
      makeClientRegistry()
    );
    const controller = new OAuthRegistrationController(service);

    const result = await controller.register({
      redirect_uris: ['https://chatgpt.com/connector/oauth/callback'],
      client_name: 'ChatGPT',
      token_endpoint_auth_method: 'none',
    });

    expect(result.scope).toBe('mcp:read mcp:write');
  });

  it('rejects non-loopback http redirect URIs', async () => {
    const service = new OAuthDynamicClientService(makeConfig(), makeClientRegistry());
    const controller = new OAuthRegistrationController(service);

    await expect(
      controller.register({
        redirect_uris: ['http://example.com/callback'],
        client_name: 'Bad Client',
        token_endpoint_auth_method: 'none',
      })
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects external https redirect URIs that are not allowlisted', async () => {
    const service = new OAuthDynamicClientService(makeConfig(), makeClientRegistry());
    const controller = new OAuthRegistrationController(service);

    await expect(
      controller.register({
        redirect_uris: ['https://attacker.test/callback'],
        client_name: 'Bad Client',
        token_endpoint_auth_method: 'none',
      })
    ).rejects.toThrow(
      'redirect_uri origin is not allowlisted. Add to MCP_DYNAMIC_CLIENT_ALLOWED_REDIRECT_ORIGINS: https://attacker.test'
    );
  });

  it('accepts external https redirect URIs from allowlisted origins', async () => {
    const service = new OAuthDynamicClientService(
      makeConfig({ allowedRedirectOrigins: ['https://claude.ai'] }),
      makeClientRegistry()
    );
    const controller = new OAuthRegistrationController(service);

    const result = await controller.register({
      redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
      client_name: 'Claude',
      token_endpoint_auth_method: 'none',
    });

    expect(result.redirect_uris).toEqual(['https://claude.ai/api/mcp/auth_callback']);
  });
});
