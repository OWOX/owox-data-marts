import { describe, expect, it, jest } from '@jest/globals';
import type {
  McpOAuthProjectMemberContext,
  OAuthAuthorizationRequest,
  OAuthTokenExchangeRequest,
} from '@owox/idp-protocol';
import type { Request, Response } from 'express';
import { OwoxBetterAuthIdp } from './owox-better-auth-idp.js';
import { AUTH_BASE_PATH } from './core/constants.js';

describe('OwoxBetterAuthIdp MCP OAuth methods', () => {
  const authorizationRequest: OAuthAuthorizationRequest = {
    clientId: 'mcp-client',
    redirectUri: 'http://127.0.0.1:1455/callback',
    resource: 'https://mcp.owox.com/mcp',
    scopes: ['mcp:read'],
    state: 'state',
    codeChallenge: 'challenge',
    codeChallengeMethod: 'S256',
  };
  const projectMember: McpOAuthProjectMemberContext = {
    userId: 'user-1',
    projectId: 'project-1',
    roles: ['admin'],
  };

  const createProvider = (identityClient: Record<string, jest.Mock>) =>
    Object.assign(Object.create(OwoxBetterAuthIdp.prototype), {
      identityClient,
    }) as OwoxBetterAuthIdp;

  it('adds project-specific MCP server URL to user API payload', async () => {
    const projectId = '8c90f0b0f314bf5f5d6f69d24fd7ee3b';
    const provider = Object.assign(Object.create(OwoxBetterAuthIdp.prototype), {
      tokenFacade: {
        parseToken: jest.fn().mockResolvedValue({
          userId: 'user-1',
          projectId,
          email: 'user@example.com',
          roles: ['admin'],
        }),
      },
      onboardingService: {
        getAnswersForPayload: jest.fn().mockResolvedValue([]),
      },
      config: {
        mcp: {
          publicBaseUrl: 'https://mcp.owox.com',
        },
      },
    }) as OwoxBetterAuthIdp;
    const request = {
      headers: { 'x-owox-authorization': 'Bearer access-token' },
    } as unknown as Request;
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;

    await provider.userApiMiddleware(request, response, jest.fn());

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        mcpServerUrl: `https://${projectId}.mcp.owox.com/mcp`,
      })
    );
  });

  it('delegates authorization code creation to Identity OWOX client', async () => {
    const identityClient = {
      createMcpOAuthAuthorizationCode: jest.fn().mockResolvedValue({
        code: 'mcp-code',
        clientId: 'mcp-client',
        redirectUri: 'http://127.0.0.1:1455/callback',
        resource: 'https://mcp.owox.com/mcp',
        scopes: ['mcp:read'],
        expiresAt: '2026-06-10T10:00:00.000Z',
      }),
    };

    await expect(
      createProvider(identityClient).createMcpOAuthAuthorizationCode(
        authorizationRequest,
        projectMember
      )
    ).resolves.toMatchObject({ code: 'mcp-code' });
    expect(identityClient.createMcpOAuthAuthorizationCode).toHaveBeenCalledWith({
      request: authorizationRequest,
      projectMember,
    });
  });

  it('delegates token exchange and verification to Identity OWOX client', async () => {
    const tokenRequest: OAuthTokenExchangeRequest = {
      grantType: 'authorization_code',
      clientId: 'mcp-client',
      code: 'mcp-code',
      redirectUri: 'http://127.0.0.1:1455/callback',
      resource: 'https://mcp.owox.com/mcp',
      codeVerifier: 'verifier',
    };
    const identityClient = {
      exchangeMcpOAuthToken: jest.fn().mockResolvedValue({
        access_token: 'mcp-access-token',
        refresh_token: 'mcp-refresh-token',
        token_type: 'Bearer',
        expires_in: 900,
        scope: 'mcp:read',
      }),
      verifyMcpAccessToken: jest.fn().mockResolvedValue({
        ...projectMember,
        clientId: 'mcp-client',
        resource: 'https://mcp.owox.com/mcp',
        scopes: ['mcp:read'],
        authFlow: 'mcp',
      }),
      getJwks: jest.fn().mockResolvedValue({ keys: [] }),
    };
    const provider = createProvider(identityClient);

    await expect(provider.exchangeMcpOAuthToken(tokenRequest)).resolves.toMatchObject({
      access_token: 'mcp-access-token',
    });
    await expect(
      provider.verifyMcpAccessToken('mcp-access-token', 'https://mcp.owox.com/mcp', ['mcp:read'])
    ).resolves.toMatchObject({ clientId: 'mcp-client', projectId: 'project-1' });
    await expect(provider.getMcpOAuthJwks()).resolves.toEqual({ keys: [] });
  });

  it('continues MCP OAuth authorize flow after silent sign-in refresh', async () => {
    const tokenFacade = {
      refreshToken: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'new-refresh-token',
        refreshTokenExpiresIn: 3600,
      }),
      setTokenToCookie: jest.fn(),
    };
    const provider = Object.assign(Object.create(OwoxBetterAuthIdp.prototype), {
      tokenFacade,
      config: {
        idpOwox: {
          idpConfig: {
            allowedRedirectOrigins: [],
          },
        },
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
    }) as OwoxBetterAuthIdp;
    const request = {
      headers: { cookie: 'refreshToken=refresh-token-1' },
      query: {
        redirect: '/oauth/authorize?response_type=code&client_id=mcp-client&state=client-state',
      },
    } as unknown as Request;
    const response = {
      redirect: jest.fn(),
    } as unknown as Response;

    await provider.signInMiddleware(request, response, jest.fn());

    expect(tokenFacade.refreshToken).toHaveBeenCalledWith('refresh-token-1');
    expect(response.redirect).toHaveBeenCalledWith(
      '/oauth/authorize?response_type=code&client_id=mcp-client&state=client-state'
    );
  });

  it('redirects MCP OAuth continuation to Platform sign-in when there is no refresh cookie', async () => {
    const idpStartMiddleware = jest.fn().mockResolvedValue(undefined);
    const provider = Object.assign(Object.create(OwoxBetterAuthIdp.prototype), {
      authFlowMiddleware: {
        idpStartMiddleware,
      },
      config: {
        idpOwox: {
          idpConfig: {
            platformSignInUrl: 'https://platform.test/auth/sign-in',
            allowedRedirectOrigins: ['https://platform.test'],
          },
        },
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
    }) as OwoxBetterAuthIdp;
    const request = {
      headers: { cookie: '' },
      query: {
        redirect: '/oauth/authorize?response_type=code&client_id=mcp-client&state=client-state',
        'app-redirect-to':
          '/oauth/authorize?response_type=code&client_id=mcp-client&state=client-state',
      },
    } as unknown as Request;
    const response = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
      redirect: jest.fn(),
    } as unknown as Response;

    await provider.signInMiddleware(request, response, jest.fn());

    expect(idpStartMiddleware).not.toHaveBeenCalled();
    expect(response.clearCookie).toHaveBeenCalledWith(
      'idp-owox-state',
      expect.objectContaining({ path: '/' })
    );
    expect(response.redirect).toHaveBeenCalledWith(
      expect.stringContaining('https://platform.test/auth/sign-in')
    );
    expect(response.redirect).toHaveBeenCalledWith(expect.stringContaining('source=app'));
    expect(response.redirect).toHaveBeenCalledWith(
      expect.stringContaining('app-redirect-to=%2Foauth%2Fauthorize')
    );
  });

  it('continues MCP OAuth authorize flow after IDP callback', async () => {
    const redirectTo =
      '/oauth/authorize?response_type=code&client_id=mcp-client&state=client-state';
    const routes = new Map<string, (req: Request, res: Response) => Promise<void>>();
    const app = {
      use: jest.fn(),
      get: jest.fn((path: string, handler: (req: Request, res: Response) => Promise<void>) => {
        routes.set(path, handler);
      }),
    };
    const tokenFacade = {
      changeAuthCode: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        refreshTokenExpiresIn: 3600,
      }),
      setTokenToCookie: jest.fn(),
      parseToken: jest.fn().mockResolvedValue({
        userId: 'user-1',
        projectId: 'project-1',
        email: 'user@example.com',
      }),
    };
    const provider = Object.assign(Object.create(OwoxBetterAuthIdp.prototype), {
      betterAuthProxyHandler: { setupBetterAuthHandler: jest.fn() },
      authErrorController: { registerRoutes: jest.fn() },
      onboardingController: { registerRoutes: jest.fn() },
      pageController: { registerRoutes: jest.fn() },
      passwordFlowController: { registerRoutes: jest.fn() },
      googleSheetsAuthController: { registerRoutes: jest.fn() },
      authFlowMiddleware: { idpStartMiddleware: jest.fn() },
      tokenFacade,
      userAuthInfoPersistenceService: {
        persistAuthInfo: jest.fn().mockResolvedValue(undefined),
      },
      onboardingService: {
        evaluateAndSetOnboardingStatus: jest.fn().mockResolvedValue(undefined),
        shouldShowQuestionnaire: jest.fn().mockResolvedValue(false),
      },
      config: {
        idpOwox: {
          baseUrl: 'https://float-device-amiss.ngrok-free.dev',
          idpConfig: {
            allowedRedirectOrigins: [],
          },
        },
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
    }) as OwoxBetterAuthIdp;

    provider.registerRoutes(app as never);
    const callback = routes.get(`${AUTH_BASE_PATH}/callback`);
    expect(callback).toBeDefined();

    const request = {
      path: `${AUTH_BASE_PATH}/callback`,
      protocol: 'https',
      hostname: 'float-device-amiss.ngrok-free.dev',
      headers: {
        cookie: `idp-owox-params=${encodeURIComponent(JSON.stringify({ redirectTo }))};`,
      },
      query: {
        code: 'code-1',
        state: 'state-1',
      },
    } as unknown as Request;
    const response = {
      redirect: jest.fn(),
      clearCookie: jest.fn(),
    } as unknown as Response;

    await callback!(request, response);

    expect(response.redirect).toHaveBeenCalledWith(redirectTo);
  });

  it('continues MCP OAuth authorize flow after IDP callback using persisted auth state params', async () => {
    const redirectTo =
      '/oauth/authorize?response_type=code&client_id=mcp-client&state=client-state';
    const routes = new Map<string, (req: Request, res: Response) => Promise<void>>();
    const app = {
      use: jest.fn(),
      get: jest.fn((path: string, handler: (req: Request, res: Response) => Promise<void>) => {
        routes.set(path, handler);
      }),
    };
    const tokenFacade = {
      changeAuthCode: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        refreshTokenExpiresIn: 3600,
        authFlowParams: {
          appRedirectTo: redirectTo,
        },
      }),
      setTokenToCookie: jest.fn(),
      parseToken: jest.fn().mockResolvedValue({
        userId: 'user-1',
        projectId: 'project-1',
        email: 'user@example.com',
      }),
    };
    const provider = Object.assign(Object.create(OwoxBetterAuthIdp.prototype), {
      betterAuthProxyHandler: { setupBetterAuthHandler: jest.fn() },
      authErrorController: { registerRoutes: jest.fn() },
      onboardingController: { registerRoutes: jest.fn() },
      pageController: { registerRoutes: jest.fn() },
      passwordFlowController: { registerRoutes: jest.fn() },
      googleSheetsAuthController: { registerRoutes: jest.fn() },
      authFlowMiddleware: { idpStartMiddleware: jest.fn() },
      tokenFacade,
      userAuthInfoPersistenceService: {
        persistAuthInfo: jest.fn().mockResolvedValue(undefined),
      },
      onboardingService: {
        evaluateAndSetOnboardingStatus: jest.fn().mockResolvedValue(undefined),
        shouldShowQuestionnaire: jest.fn().mockResolvedValue(false),
      },
      config: {
        idpOwox: {
          baseUrl: 'https://float-device-amiss.ngrok-free.dev',
          idpConfig: {
            allowedRedirectOrigins: [],
          },
        },
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
    }) as OwoxBetterAuthIdp;

    provider.registerRoutes(app as never);
    const callback = routes.get(`${AUTH_BASE_PATH}/callback`);
    expect(callback).toBeDefined();

    const request = {
      path: `${AUTH_BASE_PATH}/callback`,
      protocol: 'https',
      hostname: 'localhost',
      headers: {
        cookie: '',
      },
      query: {
        code: 'code-1',
        state: 'state-1',
      },
    } as unknown as Request;
    const response = {
      redirect: jest.fn(),
      clearCookie: jest.fn(),
    } as unknown as Response;

    await callback!(request, response);

    expect(response.redirect).toHaveBeenCalledWith(redirectTo);
  });
});
