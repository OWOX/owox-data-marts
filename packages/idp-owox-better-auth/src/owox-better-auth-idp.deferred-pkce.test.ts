import { describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { ProtocolRoute } from '@owox/idp-protocol';
import { IdentityOwoxClient } from './client/index.js';
import { AUTH_BASE_PATH } from './core/constants.js';
import { OwoxBetterAuthIdp } from './owox-better-auth-idp.js';

const APP_STATE = 'app-' + 'a'.repeat(43);

type RouteHandler = (req: Request, res: Response) => Promise<void>;

function createResponse(): Response {
  const response = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    redirect: jest.fn(),
    send: jest.fn(),
    sendStatus: jest.fn(),
    set: jest.fn(),
    json: jest.fn(),
  } as unknown as Response;
  response.status = jest.fn().mockReturnValue(response) as unknown as Response['status'];
  return response;
}

function createCallbackProvider(overrides: Record<string, unknown> = {}): {
  provider: OwoxBetterAuthIdp;
  callback: RouteHandler;
  nonceRoute: RouteHandler;
  switchRoute: RouteHandler;
} {
  const routes = new Map<string, RouteHandler>();
  const app = {
    use: jest.fn(),
    get: jest.fn((path: string, handler: RouteHandler) => routes.set(path, handler)),
    post: jest.fn((path: string, handler: RouteHandler) => routes.set(`POST ${path}`, handler)),
  };
  const provider = Object.assign(Object.create(OwoxBetterAuthIdp.prototype), {
    betterAuthProxyHandler: { setupBetterAuthHandler: jest.fn() },
    authErrorController: { registerRoutes: jest.fn() },
    onboardingController: { registerRoutes: jest.fn() },
    pageController: { registerRoutes: jest.fn() },
    passwordFlowController: { registerRoutes: jest.fn() },
    googleSheetsAuthController: { registerRoutes: jest.fn() },
    authFlowMiddleware: { idpStartMiddleware: jest.fn() },
    tokenFacade: { changeAuthCode: jest.fn().mockRejectedValue(new Error('boom')) },
    userAuthInfoPersistenceService: { persistAuthInfo: jest.fn() },
    onboardingService: {
      evaluateAndSetOnboardingStatus: jest.fn(),
      shouldShowQuestionnaire: jest.fn(),
    },
    config: {
      idpOwox: { baseUrl: 'https://app.test', idpConfig: { allowedRedirectOrigins: [] } },
    },
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    ...overrides,
  }) as OwoxBetterAuthIdp;

  provider.registerRoutes(app as never);
  const callback = routes.get(`${AUTH_BASE_PATH}/callback`);
  if (!callback) throw new Error('Callback route was not registered');
  const nonceRoute = routes.get(`POST ${AUTH_BASE_PATH}/social-intent/nonce`);
  if (!nonceRoute) throw new Error('Social intent nonce route was not registered');
  const switchRoute = routes.get(`POST ${AUTH_BASE_PATH}/project/switch`);
  if (!switchRoute) throw new Error('Project switch route was not registered');
  return { provider, callback, nonceRoute, switchRoute };
}

function createProvider(overrides: Record<string, unknown> = {}): OwoxBetterAuthIdp {
  return Object.assign(Object.create(OwoxBetterAuthIdp.prototype), {
    appSignInService: { start: jest.fn().mockResolvedValue(APP_STATE) },
    pageController: {
      signInPage: jest.fn().mockResolvedValue(undefined),
      signUpPage: jest.fn().mockResolvedValue(undefined),
      isSocialProviderEnabled: jest.fn().mockReturnValue(true),
    },
    config: {
      idpOwox: {
        idpConfig: {
          platformSignInUrl: 'https://platform.test/auth/sign-in',
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
    ...overrides,
  }) as OwoxBetterAuthIdp;
}

describe('OwoxBetterAuthIdp Cloud sign-in', () => {
  it('registers project switching as part of the Cloud provider', async () => {
    const switchProjectMiddleware = jest
      .fn<(req: Request, res: Response) => Promise<void>>()
      .mockResolvedValue(undefined);
    const { switchRoute } = createCallbackProvider({ tokenFacade: { switchProjectMiddleware } });
    const request = {} as Request;
    const response = createResponse();

    await switchRoute(request, response);

    expect(switchProjectMiddleware).toHaveBeenCalledWith(request, response);
  });

  describe('signInMiddleware / handleNoState', () => {
    it('renders local sign-in with a fresh PKCE state', async () => {
      const provider = createProvider();
      const request = {
        headers: { cookie: '' },
        query: {},
      } as unknown as Request;
      const response = createResponse();

      await provider.signInMiddleware(request, response, jest.fn());

      expect(provider['pageController'].signInPage).toHaveBeenCalledWith(request, response, true);
      expect(response.redirect).not.toHaveBeenCalled();
    });

    it('does not trust a provider named only in the query string', async () => {
      const provider = createProvider();
      const request = {
        headers: { cookie: 'idp-owox-state=page-load-state' },
        query: { pendingAction: 'google' },
      } as unknown as Request;
      const response = createResponse();

      await provider.signInMiddleware(request, response, jest.fn());

      expect(provider['pageController'].signInPage).toHaveBeenCalledWith(request, response, true);
      expect(response.redirect).not.toHaveBeenCalled();
      expect(response.clearCookie).not.toHaveBeenCalledWith('idp-owox-state', expect.anything());
      expect(response.cookie).not.toHaveBeenCalledWith(
        'idp-owox-params',
        expect.stringContaining('pendingAction'),
        expect.anything()
      );
    });

    it('does not persist an unrecognized pending action', async () => {
      const provider = createProvider();
      const request = {
        headers: { cookie: '' },
        query: { pendingAction: 'not-a-real-action' },
      } as unknown as Request;
      const response = createResponse();

      await provider.signInMiddleware(request, response, jest.fn());

      expect(provider['pageController'].signInPage).toHaveBeenCalledWith(request, response, true);
      expect(response.redirect).not.toHaveBeenCalled();
      const paramsCookieCall = (response.cookie as jest.Mock).mock.calls.find(
        call => call[0] === 'idp-owox-params'
      );
      expect(paramsCookieCall).toBeUndefined();
    });

    it('reuses the current IB session for a project link', async () => {
      const handleExistingRefreshToken = jest.fn().mockResolvedValue(true);
      const provider = createProvider({ handleExistingRefreshToken });
      const request = {
        headers: { cookie: 'refreshToken=refresh-token-1' },
        query: { projectId: 'project-1' },
      } as unknown as Request;
      const response = createResponse();

      await provider.signInMiddleware(request, response, jest.fn());

      expect(handleExistingRefreshToken).toHaveBeenCalledWith(request, response, 'refresh-token-1');
      expect(provider['pageController'].signInPage).not.toHaveBeenCalled();
    });

    it('starts a fresh App sign-in after a Platform handoff with another App session', async () => {
      const handleExistingRefreshToken = jest.fn();
      const provider = createProvider({ handleExistingRefreshToken });
      const target = '/ui/project-1/data-marts/mart-1?tab=overview#details';
      const oldParams = encodeURIComponent(
        JSON.stringify({ projectId: 'old-project', redirectTo: '/ui/old-project/data-marts' })
      );
      const request = {
        headers: {
          cookie: `refreshToken=existing; idp-owox-state=legacy-state; idp-owox-params=${oldParams}`,
        },
        query: { prompt: 'login', projectId: 'project-1', 'app-redirect-to': target },
      } as unknown as Request;
      const response = createResponse();

      await provider.signInMiddleware(request, response, jest.fn());

      expect(handleExistingRefreshToken).not.toHaveBeenCalled();
      expect(provider['appSignInService'].start).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'project-1',
          appRedirectTo: target,
          redirectTo: undefined,
          projectRedirectUserId: undefined,
        })
      );
      expect(provider['pageController'].signInPage).toHaveBeenCalledWith(request, response, true);
      expect(response.redirect).not.toHaveBeenCalled();
    });

    it('keeps the Platform-owned PKCE flow for a Platform state', async () => {
      const signInMiddleware = jest.fn();
      const provider = createProvider({ authFlowMiddleware: { signInMiddleware } });
      const request = {
        headers: { cookie: '' },
        query: { state: 'platform-state', source: 'platform' },
      } as unknown as Request;
      const response = createResponse();
      const next = jest.fn();

      await provider.signInMiddleware(request, response, next);

      expect(signInMiddleware).toHaveBeenCalledWith(request, response, next);
      expect(provider['appSignInService'].start).not.toHaveBeenCalled();
    });

    it('does not reuse a refresh token while a verified social choice is awaiting state', async () => {
      const handleExistingRefreshToken = jest.fn();
      const provider = createProvider({ handleExistingRefreshToken });
      const request = {
        headers: {
          cookie: 'refreshToken=existing; idp-owox-verified-social-intent=microsoft',
        },
        query: {},
      } as unknown as Request;
      const response = createResponse();

      await provider.signInMiddleware(request, response, jest.fn());

      expect(handleExistingRefreshToken).not.toHaveBeenCalled();
      expect(provider['pageController'].signInPage).toHaveBeenCalledWith(request, response, true);
      expect(response.redirect).not.toHaveBeenCalled();
    });

    it('renders errors locally and preserves the OAuth continuation', async () => {
      const handleExistingRefreshToken = jest.fn();
      const provider = createProvider({ handleExistingRefreshToken });
      const redirectTo = '/oauth/authorize?client_id=mcp-client';
      const paramsCookie = encodeURIComponent(JSON.stringify({ redirectTo }));
      const request = {
        headers: { cookie: `refreshToken=existing; idp-owox-params=${paramsCookie}` },
        query: { error: 'Your sign-in session expired. Please try again.' },
        protocol: 'https',
        hostname: 'app.test',
      } as unknown as Request;
      const response = createResponse();

      await provider.signInMiddleware(request, response, jest.fn());

      expect(handleExistingRefreshToken).not.toHaveBeenCalled();
      expect(provider['pageController'].signInPage).toHaveBeenCalledWith(request, response, true);
      expect(provider['appSignInService'].start).toHaveBeenCalledWith(
        expect.objectContaining({ redirectTo })
      );
      expect(response.redirect).not.toHaveBeenCalled();
      expect(response.cookie).toHaveBeenCalledWith(
        'idp-owox-params',
        expect.stringContaining(encodeURIComponent('/oauth/authorize')),
        expect.anything()
      );
    });
  });

  it.each([
    [ProtocolRoute.SIGN_IN, 'facebook-marketing', undefined],
    [ProtocolRoute.SIGN_IN, undefined, 'yoy'],
    [ProtocolRoute.SIGN_UP, 'facebook-marketing', undefined],
    [ProtocolRoute.SIGN_UP, undefined, 'yoy'],
  ])(
    'starts %s on App with incoming source %s and stored source %s',
    async (route, source, storedSource) => {
      const provider = createProvider();
      const oldParams = encodeURIComponent(JSON.stringify({ source: storedSource }));
      const request = {
        path: `${AUTH_BASE_PATH}/${route}`,
        headers: { cookie: `idp-owox-state=legacy-state; idp-owox-params=${oldParams}` },
        query: source ? { source } : {},
      } as unknown as Request;
      const response = createResponse();

      if (route === ProtocolRoute.SIGN_IN) {
        await provider.signInMiddleware(request, response, jest.fn());
        expect(provider['pageController'].signInPage).toHaveBeenCalledWith(request, response, true);
      } else {
        await provider.signUpMiddleware(request, response, jest.fn());
        expect(provider['pageController'].signUpPage).toHaveBeenCalledWith(request, response, true);
      }

      expect(provider['appSignInService'].start).toHaveBeenCalledWith(
        expect.objectContaining({ source: source ?? storedSource })
      );
      expect(response.cookie).toHaveBeenCalledWith('idp-owox-state', APP_STATE, expect.anything());
      expect(response.redirect).not.toHaveBeenCalled();
    }
  );

  describe('social-intent POST', () => {
    it('issues a fresh nonce on a same-origin button request', async () => {
      const { nonceRoute } = createCallbackProvider();
      const request = {
        headers: { cookie: '' },
        protocol: 'https',
        hostname: 'app.test',
        get: jest.fn((name: string) =>
          name === 'host' ? 'app.test' : name === 'origin' ? 'https://app.test' : undefined
        ),
      } as unknown as Request;
      const response = createResponse();

      await nonceRoute(request, response);

      expect(response.cookie).toHaveBeenCalledWith(
        'idp-owox-social-intent',
        expect.any(String),
        expect.objectContaining({ maxAge: 120000, httpOnly: true })
      );
      expect(response.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
      expect(response.json).toHaveBeenCalledWith({ nonce: expect.any(String) });
    });

    it('does not issue a readable nonce to a different origin', async () => {
      const { nonceRoute } = createCallbackProvider();
      const request = {
        protocol: 'https',
        get: jest.fn((name: string) =>
          name === 'host' ? 'app.test' : name === 'origin' ? 'https://other.test' : undefined
        ),
      } as unknown as Request;
      const response = createResponse();

      await nonceRoute(request, response);

      expect(response.sendStatus).toHaveBeenCalledWith(403);
      expect(response.cookie).not.toHaveBeenCalled();
    });

    it('starts a new App attempt after a verified social click', async () => {
      const handleExistingRefreshToken = jest.fn();
      const provider = createProvider({ handleExistingRefreshToken });
      const nonce = 'page-nonce';
      const nonceCookie = encodeURIComponent(
        JSON.stringify([{ value: nonce, issuedAt: Date.now() }])
      );
      const request = {
        headers: {
          cookie: `idp-owox-social-intent=${nonceCookie}; idp-owox-state=${APP_STATE}; refreshToken=existing`,
        },
        query: {},
        body: { provider: 'google', nonce },
        protocol: 'https',
        hostname: 'app.test',
        path: '/auth/sign-in/social-intent',
      } as unknown as Request;
      const response = createResponse();

      await provider['handleSocialIntent'](request, response, ProtocolRoute.SIGN_IN);

      expect(handleExistingRefreshToken).not.toHaveBeenCalled();
      expect(response.cookie).toHaveBeenCalledWith(
        'idp-owox-state',
        APP_STATE,
        expect.objectContaining({ httpOnly: true })
      );
      expect(response.cookie).toHaveBeenCalledWith(
        'idp-owox-verified-social-intent',
        'google',
        expect.objectContaining({ maxAge: 120000, httpOnly: true })
      );
      expect(response.cookie).not.toHaveBeenCalledWith(
        'idp-owox-params',
        expect.stringContaining('pendingAction'),
        expect.anything()
      );
      expect(response.redirect).toHaveBeenCalledWith(`/auth/sign-in?state=${APP_STATE}`);
    });

    it('rejects a provider request without the nonce from a rendered page', async () => {
      const provider = createProvider();
      const request = {
        headers: { cookie: '' },
        query: {},
        body: { provider: 'microsoft', nonce: 'forged' },
      } as unknown as Request;
      const response = createResponse();

      await provider['handleSocialIntent'](request, response, ProtocolRoute.SIGN_IN);

      expect(response.status).toHaveBeenCalledWith(403);
      expect(response.redirect).not.toHaveBeenCalled();
    });

    it.each([
      ['replayed', Date.now(), 'different-nonce'],
      ['expired', Date.now() - 120001, 'page-nonce'],
    ])('rejects a %s nonce', async (_case, issuedAt, submittedNonce) => {
      const provider = createProvider();
      const nonceCookie = encodeURIComponent(JSON.stringify([{ value: 'page-nonce', issuedAt }]));
      const request = {
        headers: { cookie: `idp-owox-social-intent=${nonceCookie}` },
        query: {},
        body: { provider: 'google', nonce: submittedNonce },
        protocol: 'https',
        hostname: 'app.test',
      } as unknown as Request;
      const response = createResponse();

      await provider['handleSocialIntent'](request, response, ProtocolRoute.SIGN_IN);

      expect(response.status).toHaveBeenCalledWith(403);
      expect(response.redirect).not.toHaveBeenCalled();
      expect(response.cookie).not.toHaveBeenCalledWith(
        'idp-owox-verified-social-intent',
        expect.anything(),
        expect.anything()
      );
    });

    it('rejects a disabled Microsoft provider with a valid nonce', async () => {
      const isSocialProviderEnabled = jest.fn((provider: string) => provider !== 'microsoft');
      const provider = createProvider({ pageController: { isSocialProviderEnabled } });
      const nonceCookie = encodeURIComponent(
        JSON.stringify([{ value: 'page-nonce', issuedAt: Date.now() }])
      );
      const request = {
        headers: { cookie: `idp-owox-social-intent=${nonceCookie}` },
        query: {},
        body: { provider: 'microsoft', nonce: 'page-nonce' },
        protocol: 'https',
        hostname: 'app.test',
      } as unknown as Request;
      const response = createResponse();

      await provider['handleSocialIntent'](request, response, ProtocolRoute.SIGN_IN);

      expect(response.status).toHaveBeenCalledWith(403);
      expect(response.redirect).not.toHaveBeenCalled();
    });
  });

  describe('signUpMiddleware', () => {
    it('renders the sign-up page locally without starting a Platform PKCE round trip on a plain, unauthenticated page load', async () => {
      const provider = createProvider();
      const request = {
        headers: { cookie: '' },
        query: {},
      } as unknown as Request;
      const response = createResponse();

      await provider.signUpMiddleware(request, response, jest.fn());

      expect(provider['pageController'].signUpPage).toHaveBeenCalledWith(request, response, true);
      expect(response.redirect).not.toHaveBeenCalled();
    });

    it('renders locally when a link names a provider without a button POST', async () => {
      const provider = createProvider();
      const request = {
        headers: { cookie: 'idp-owox-state=page-load-state' },
        query: { pendingAction: 'microsoft' },
      } as unknown as Request;
      const response = createResponse();

      await provider.signUpMiddleware(request, response, jest.fn());

      expect(provider['pageController'].signUpPage).toHaveBeenCalledWith(request, response, true);
      expect(response.redirect).not.toHaveBeenCalled();
    });

    it('renders local registration even for a visitor with a refresh cookie', async () => {
      const provider = createProvider();
      const request = {
        headers: { cookie: 'refreshToken=refresh-token-1' },
        query: {},
      } as unknown as Request;
      const response = createResponse();

      await provider.signUpMiddleware(request, response, jest.fn());

      expect(provider['pageController'].signUpPage).toHaveBeenCalledWith(request, response, true);
      expect(response.redirect).not.toHaveBeenCalled();
    });

    it('renders locally when a projectId only exists in the persisted params cookie, not this request', async () => {
      const provider = createProvider();
      const persistedParams = encodeURIComponent(JSON.stringify({ projectId: 'stale-project' }));
      const request = {
        headers: { cookie: `idp-owox-params=${persistedParams}` },
        query: {},
      } as unknown as Request;
      const response = createResponse();

      await provider.signUpMiddleware(request, response, jest.fn());

      expect(provider['pageController'].signUpPage).toHaveBeenCalledWith(request, response, true);
      expect(response.redirect).not.toHaveBeenCalled();
    });

    it('keeps the invited project on local registration', async () => {
      const provider = createProvider();
      const request = {
        headers: { cookie: '' },
        query: { projectId: 'project-1' },
      } as unknown as Request;
      const response = createResponse();

      await provider.signUpMiddleware(request, response, jest.fn());

      expect(provider['pageController'].signUpPage).toHaveBeenCalledWith(request, response, true);
      expect(response.redirect).not.toHaveBeenCalled();
    });
  });

  describe('signOutMiddleware', () => {
    it('clears the auth-flow cookies, not just the refresh token and Better Auth cookies', async () => {
      const provider = createProvider({
        revokeToken: jest.fn().mockResolvedValue(undefined),
        config: {
          idpOwox: { idpConfig: { signOutRedirectUrl: undefined } },
        },
      });
      const request = {
        headers: { cookie: 'refreshToken=refresh-token-1' },
      } as unknown as Request;
      const response = createResponse();

      await provider.signOutMiddleware(request, response, jest.fn());

      const clearedCookies = (response.clearCookie as jest.Mock).mock.calls.map(call => call[0]);
      expect(clearedCookies).toEqual(expect.arrayContaining(['idp-owox-state', 'idp-owox-params']));
    });
  });

  describe('App sign-in completion', () => {
    it.each([
      [
        {
          message: 'Authentication Flow Error, no project',
          code: 'APP_SIGN_IN_NO_PROJECT',
          details: { viewOnly: true },
        },
        'This account has no OWOX project. OWOX cannot create a project automatically in view-only mode. Sign in with a different account or ask a project admin for access.',
      ],
      [
        {
          message: 'Authentication Flow Error, no project',
          code: 'APP_SIGN_IN_NO_PROJECT',
          details: { viewOnly: false },
        },
        'This account has no OWOX project. Sign in with a different account or ask a project admin for access.',
      ],
      [
        { message: 'Authentication Flow Error, no project' },
        'This account has no OWOX project. Sign in with a different account or ask a project admin for access.',
      ],
      [{ message: 'invalid request' }, 'Unable to complete sign-in. Please try again.'],
    ])('maps IB error %j to a sign-in page message', async (body, expectedMessage) => {
      const client = Object.assign(Object.create(IdentityOwoxClient.prototype), {
        clientBackchannelPrefix: '/internal-api',
        getC2cAuthHeader: jest.fn().mockResolvedValue({}),
        http: {
          post: jest.fn().mockRejectedValue({
            isAxiosError: true,
            response: { status: 400, data: body },
          }),
        },
      }) as IdentityOwoxClient;
      const { provider } = createCallbackProvider({
        appSignInService: {
          complete: () =>
            client.authorizeAppSignIn({
              state: APP_STATE,
              codeChallenge: 'a'.repeat(43),
              userInfo: { uid: 'subject', signinProvider: 'google', email: 'user@example.test' },
            }),
        },
      });
      const request = {
        headers: { cookie: `idp-owox-state=${APP_STATE}` },
        query: {},
      } as Request;

      const destination = await provider['completeAppSignIn'](
        request,
        createResponse(),
        'verified-session',
        'google',
        APP_STATE
      );

      expect(destination.pathname).toBe('/auth/sign-in');
      expect(destination.searchParams.get('error')).toBe(expectedMessage);
    });

    it.each([
      {
        scenario: 'Gmail without organization',
        projectId: 'new-project',
        roles: ['admin'],
        viewOnly: false,
      },
      { scenario: 'manual provisioning', projectId: 'main-project', roles: [], viewOnly: false },
      {
        scenario: 'automatic provisioning',
        projectId: 'main-project',
        roles: ['viewer'],
        viewOnly: false,
      },
      { scenario: 'look as', projectId: 'project', roles: [], viewOnly: true },
    ])(
      'installs the IB refresh session and keeps the project link for $scenario',
      async ({ projectId, roles, viewOnly }) => {
        const redirectTo = `/ui/${projectId}/data-marts/data-mart?tab=overview#details`;
        const complete = jest.fn().mockResolvedValue({
          accessToken: 'access-token',
          refreshToken: 'rotated-refresh-token',
          refreshTokenExpiresIn: 3600,
          authFlowParams: { redirectTo },
        });
        const setTokenToCookie = jest.fn();
        const persistAuthInfo = jest.fn();
        const { provider } = createCallbackProvider({
          appSignInService: { complete },
          tokenFacade: {
            parseToken: jest.fn().mockResolvedValue({
              userId: 'user',
              projectId,
              roles,
              viewOnly,
            }),
            setTokenToCookie,
          },
          userAuthInfoPersistenceService: { persistAuthInfo },
          serverEvents: { login: jest.fn() },
        });
        const req = {
          headers: { cookie: `idp-owox-state=${APP_STATE}` },
          query: {},
        } as Request;
        const res = createResponse();

        const destination = await provider['completeAppSignIn'](
          req,
          res,
          'verified-session',
          'google',
          APP_STATE
        );

        expect(destination.toString()).toBe(`https://app.test${redirectTo}`);
        expect(setTokenToCookie).toHaveBeenCalledWith(res, req, 'rotated-refresh-token', 3600);
        expect(persistAuthInfo.mock.calls).toEqual(viewOnly ? [] : [['access-token']]);
        expect(provider['onboardingService'].evaluateAndSetOnboardingStatus).toHaveBeenCalledTimes(
          !viewOnly && roles.length > 0 ? 1 : 0
        );
        expect(res.clearCookie).toHaveBeenCalledWith('idp-owox-state', expect.anything());
      }
    );

    it('rejects a callback when the browser is on a different sign-in attempt', async () => {
      const complete = jest.fn();
      const { provider } = createCallbackProvider({ appSignInService: { complete } });
      const req = {
        headers: { cookie: `idp-owox-state=app-${'b'.repeat(43)}` },
        query: {},
      } as Request;

      const destination = await provider['completeAppSignIn'](
        req,
        createResponse(),
        'verified-session',
        'google',
        APP_STATE
      );

      expect(destination.pathname).toBe('/auth/sign-in');
      expect(destination.searchParams.has('error')).toBe(true);
      expect(complete).not.toHaveBeenCalled();
    });
  });

  describe('/auth/callback error paths', () => {
    it('does not exchange a legacy callback code against an App sign-in state', async () => {
      const changeAuthCode = jest.fn();
      const { callback } = createCallbackProvider({ tokenFacade: { changeAuthCode } });
      const req = {
        path: `${AUTH_BASE_PATH}/callback`,
        headers: {},
        query: { code: 'legacy-code', state: APP_STATE },
      } as Request;
      const res = createResponse();

      await callback(req, res);

      expect(changeAuthCode).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(expect.stringMatching(/^\/auth\/sign-in\?error=/));
    });

    it('keeps an OAuth continuation and shows an error when the callback is missing a code', async () => {
      const { callback } = createCallbackProvider();
      const redirectTo = '/oauth/authorize?client_id=mcp-client';
      const paramsCookie = encodeURIComponent(JSON.stringify({ redirectTo }));
      const request = {
        path: `${AUTH_BASE_PATH}/callback`,
        headers: { cookie: `idp-owox-params=${paramsCookie}` },
        query: {},
      } as unknown as Request;
      const response = createResponse();

      await callback(request, response);

      const clearedCookies = (response.clearCookie as jest.Mock).mock.calls.map(call => call[0]);
      expect(clearedCookies).toContain('idp-owox-state');
      expect(clearedCookies).not.toContain('idp-owox-params');
      expect(response.cookie).toHaveBeenCalledWith(
        'idp-owox-params',
        expect.stringContaining(encodeURIComponent('/oauth/authorize')),
        expect.anything()
      );
      expect(response.redirect).toHaveBeenCalledWith(expect.stringContaining('error='));
    });

    it('drops a generated project redirect and shows an error when the token exchange throws', async () => {
      const { callback } = createCallbackProvider();
      const paramsCookie = encodeURIComponent(
        JSON.stringify({
          projectId: 'project-1',
          appRedirectTo: '/ui/project-1/data-marts',
        })
      );
      const request = {
        path: `${AUTH_BASE_PATH}/callback`,
        headers: { cookie: `idp-owox-params=${paramsCookie}` },
        query: { code: 'code-1', state: 'state-1' },
      } as unknown as Request;
      const response = createResponse();

      await callback(request, response);

      const clearedCookies = (response.clearCookie as jest.Mock).mock.calls.map(call => call[0]);
      expect(clearedCookies).toEqual(expect.arrayContaining(['idp-owox-state', 'idp-owox-params']));
      expect(response.redirect).toHaveBeenCalledWith(expect.stringContaining('error='));
    });
  });
});
