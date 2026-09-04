import { describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { AUTH_BASE_PATH } from './core/constants.js';
import { OwoxBetterAuthIdp } from './owox-better-auth-idp.js';

type RouteHandler = (req: Request, res: Response) => Promise<void>;

function createCallbackProvider(params: {
  authenticatedUserId?: string;
  appRedirectTo: string;
  projectRedirectUserId?: string;
}): { provider: OwoxBetterAuthIdp; callback: RouteHandler } {
  const routes = new Map<string, RouteHandler>();
  const app = {
    use: jest.fn(),
    get: jest.fn((path: string, handler: RouteHandler) => routes.set(path, handler)),
  };
  const tokenFacade = {
    changeAuthCode: jest.fn().mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      refreshTokenExpiresIn: 3600,
      authFlowParams: {
        appRedirectTo: params.appRedirectTo,
        projectRedirectUserId: params.projectRedirectUserId,
      },
    }),
    setTokenToCookie: jest.fn(),
    parseToken: jest.fn().mockResolvedValue(
      params.authenticatedUserId
        ? {
            userId: params.authenticatedUserId,
            projectId: 'current-project',
            email: 'user@example.com',
          }
        : null
    ),
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
        baseUrl: 'https://app.test',
        idpConfig: { allowedRedirectOrigins: [] },
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
  if (!callback) throw new Error('Callback route was not registered');
  return { provider, callback };
}

function createCallbackRequest(): Request {
  return {
    path: `${AUTH_BASE_PATH}/callback`,
    protocol: 'https',
    hostname: 'app.test',
    headers: { cookie: '' },
    query: { code: 'code-1', state: 'state-1' },
  } as unknown as Request;
}

function createResponse(): Response {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    redirect: jest.fn(),
  } as unknown as Response;
}

describe('OwoxBetterAuthIdp user-bound project redirects', () => {
  it('binds a generated project redirect to the user active before a state mismatch', async () => {
    const tokenFacade = {
      parseToken: jest.fn().mockResolvedValue({
        userId: 'microsoft-user',
        projectId: 'microsoft-project',
      }),
    };
    const provider = Object.assign(Object.create(OwoxBetterAuthIdp.prototype), {
      tokenFacade,
      config: {
        idpOwox: {
          idpConfig: {
            platformSignInUrl: 'https://platform.test/auth/sign-in',
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
    const persistedParams = encodeURIComponent(JSON.stringify({ projectId: 'microsoft-project' }));
    const request = {
      path: `${AUTH_BASE_PATH}/sign-in`,
      protocol: 'https',
      hostname: 'app.test',
      headers: {
        cookie: `idp-owox-state=old-state; idp-owox-params=${persistedParams}; refreshToken=microsoft-refresh-token`,
      },
      query: { state: 'new-state' },
    } as unknown as Request;
    const response = createResponse();

    await provider.signInMiddleware(request, response, jest.fn());

    expect(tokenFacade.parseToken).toHaveBeenCalledWith('microsoft-refresh-token');
    const paramsCookieCall = (response.cookie as jest.Mock).mock.calls.find(
      call => call[0] === 'idp-owox-params'
    );
    expect(paramsCookieCall).toBeDefined();
    const params = JSON.parse(decodeURIComponent(paramsCookieCall?.[1] as string));
    expect(params).toMatchObject({
      appRedirectTo: '/auth/idp-start?projectId=microsoft-project',
      projectRedirectUserId: 'microsoft-user',
    });
  });

  it('binds a generated project redirect from the sign-up fallback', async () => {
    const tokenFacade = {
      parseToken: jest.fn().mockResolvedValue({
        userId: 'current-user',
        projectId: 'current-project',
      }),
    };
    const provider = Object.assign(Object.create(OwoxBetterAuthIdp.prototype), {
      tokenFacade,
      config: {
        idpOwox: {
          idpConfig: {
            platformSignUpUrl: 'https://platform.test/auth/sign-up',
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
    const persistedParams = encodeURIComponent(JSON.stringify({ projectId: 'current-project' }));
    const request = {
      path: `${AUTH_BASE_PATH}/sign-up`,
      protocol: 'https',
      hostname: 'app.test',
      headers: {
        cookie: `idp-owox-params=${persistedParams}; refreshToken=current-refresh-token`,
      },
      query: {},
    } as unknown as Request;
    const response = createResponse();

    await provider.signUpMiddleware(request, response, jest.fn());

    expect(tokenFacade.parseToken).toHaveBeenCalledWith('current-refresh-token');
    const paramsCookieCall = (response.cookie as jest.Mock).mock.calls.find(
      call => call[0] === 'idp-owox-params'
    );
    const params = JSON.parse(decodeURIComponent(paramsCookieCall?.[1] as string));
    expect(params).toMatchObject({
      appRedirectTo: '/auth/idp-start?projectId=current-project',
      projectRedirectUserId: 'current-user',
    });
  });

  it('discards a generated project redirect when its user cannot be resolved', async () => {
    const tokenFacade = {
      parseToken: jest.fn().mockResolvedValue(null),
    };
    const provider = Object.assign(Object.create(OwoxBetterAuthIdp.prototype), {
      tokenFacade,
      config: {
        idpOwox: {
          idpConfig: {
            platformSignInUrl: 'https://platform.test/auth/sign-in',
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
    const persistedParams = encodeURIComponent(JSON.stringify({ projectId: 'previous-project' }));
    const request = {
      path: `${AUTH_BASE_PATH}/sign-in`,
      protocol: 'https',
      hostname: 'app.test',
      headers: {
        cookie: `idp-owox-state=old-state; idp-owox-params=${persistedParams}; refreshToken=unverifiable-refresh-token`,
      },
      query: { state: 'new-state' },
    } as unknown as Request;
    const response = createResponse();

    await provider.signInMiddleware(request, response, jest.fn());

    const redirectUrl = (response.redirect as jest.Mock).mock.calls[0]?.[0] as string;
    expect(redirectUrl).not.toContain('projectId');
    expect(redirectUrl).not.toContain('app-redirect-to');
    expect(response.cookie).not.toHaveBeenCalledWith(
      'idp-owox-params',
      expect.anything(),
      expect.anything()
    );
  });

  it('discards an automatic project redirect after a different user signs in', async () => {
    const { callback } = createCallbackProvider({
      authenticatedUserId: 'credential-user',
      appRedirectTo: '/auth/idp-start?projectId=microsoft-project',
      projectRedirectUserId: 'microsoft-user',
    });
    const response = createResponse();

    await callback(createCallbackRequest(), response);

    expect(response.redirect).toHaveBeenCalledWith('/');
  });

  it('discards a bound project redirect when the callback user cannot be resolved', async () => {
    const { callback } = createCallbackProvider({
      appRedirectTo: '/auth/idp-start?projectId=previous-project',
      projectRedirectUserId: 'previous-user',
    });
    const response = createResponse();

    await callback(createCallbackRequest(), response);

    expect(response.redirect).toHaveBeenCalledWith('/');
  });

  it('keeps an automatic project redirect when the same user signs in', async () => {
    const appRedirectTo = '/auth/idp-start?projectId=microsoft-project';
    const { callback } = createCallbackProvider({
      authenticatedUserId: 'microsoft-user',
      appRedirectTo,
      projectRedirectUserId: 'microsoft-user',
    });
    const response = createResponse();

    await callback(createCallbackRequest(), response);

    expect(response.redirect).toHaveBeenCalledWith(appRedirectTo);
  });

  it('keeps an explicit project redirect that has no user binding', async () => {
    const appRedirectTo = '/auth/idp-start?projectId=shared-project';
    const { callback } = createCallbackProvider({
      authenticatedUserId: 'credential-user',
      appRedirectTo,
    });
    const response = createResponse();

    await callback(createCallbackRequest(), response);

    expect(response.redirect).toHaveBeenCalledWith(appRedirectTo);
  });
});
