import { describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { AUTH_BASE_PATH } from './core/constants.js';
import { OwoxBetterAuthIdp } from './owox-better-auth-idp.js';

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
  return { provider, callback, nonceRoute };
}

function createProvider(overrides: Record<string, unknown> = {}): OwoxBetterAuthIdp {
  return Object.assign(Object.create(OwoxBetterAuthIdp.prototype), {
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

describe('OwoxBetterAuthIdp - deferred PKCE state until sign-in intent', () => {
  describe('signInMiddleware / handleNoState', () => {
    it('bounces to Platform on a plain, unauthenticated page load, so the email/password form has a state ready to submit against', async () => {
      const provider = createProvider();
      const request = {
        headers: { cookie: '' },
        query: {},
      } as unknown as Request;
      const response = createResponse();

      await provider.signInMiddleware(request, response, jest.fn());

      expect(provider['pageController'].signInPage).not.toHaveBeenCalled();
      expect(response.redirect).toHaveBeenCalledWith(
        expect.stringContaining('https://platform.test/auth/sign-in')
      );
    });

    it('does not trust a provider named only in the query string', async () => {
      const provider = createProvider();
      const request = {
        headers: { cookie: 'idp-owox-state=page-load-state' },
        query: { pendingAction: 'google' },
      } as unknown as Request;
      const response = createResponse();

      await provider.signInMiddleware(request, response, jest.fn());

      expect(provider['pageController'].signInPage).not.toHaveBeenCalled();
      expect(response.redirect).toHaveBeenCalledWith(
        expect.stringContaining('https://platform.test/auth/sign-in')
      );
      expect(response.clearCookie).not.toHaveBeenCalledWith('idp-owox-state', expect.anything());
      expect(response.cookie).not.toHaveBeenCalledWith(
        'idp-owox-params',
        expect.stringContaining('pendingAction'),
        expect.anything()
      );
    });

    it('still bounces for an unrecognized pendingAction value, but does not persist it for later resume', async () => {
      const provider = createProvider();
      const request = {
        headers: { cookie: '' },
        query: { pendingAction: 'not-a-real-action' },
      } as unknown as Request;
      const response = createResponse();

      await provider.signInMiddleware(request, response, jest.fn());

      expect(provider['pageController'].signInPage).not.toHaveBeenCalled();
      expect(response.redirect).toHaveBeenCalledWith(
        expect.stringContaining('https://platform.test/auth/sign-in')
      );
      const paramsCookieCall = (response.cookie as jest.Mock).mock.calls.find(
        call => call[0] === 'idp-owox-params'
      );
      expect(paramsCookieCall).toBeUndefined();
    });

    it('still bounces to Platform for an existing fast-path (project + refresh token) without requiring pendingAction', async () => {
      const idpStartMiddleware = jest.fn().mockResolvedValue(undefined);
      const provider = createProvider({
        authFlowMiddleware: { idpStartMiddleware },
      });
      const request = {
        headers: { cookie: 'refreshToken=refresh-token-1' },
        query: { projectId: 'project-1' },
      } as unknown as Request;
      const response = createResponse();

      await provider.signInMiddleware(request, response, jest.fn());

      expect(idpStartMiddleware).toHaveBeenCalledWith(request, response);
      expect(provider['pageController'].signInPage).not.toHaveBeenCalled();
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
      expect(response.redirect).toHaveBeenCalledWith(
        expect.stringContaining('https://platform.test/auth/sign-in')
      );
    });

    it('keeps an expired-state error across the Platform bounce, even with a refresh token', async () => {
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
      expect(response.cookie).toHaveBeenCalledWith(
        'idp-owox-auth-error',
        'Your sign-in session expired. Please try again.',
        expect.objectContaining({ maxAge: 120000 })
      );
      expect(response.redirect).toHaveBeenCalledWith(
        expect.stringContaining('https://platform.test/auth/sign-in')
      );
      expect(response.cookie).toHaveBeenCalledWith(
        'idp-owox-params',
        expect.stringContaining(encodeURIComponent('/oauth/authorize')),
        expect.anything()
      );
    });
  });

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

    it('accepts a page nonce, clears the old state, and bypasses refresh-token reuse', async () => {
      const handleExistingRefreshToken = jest.fn();
      const provider = createProvider({ handleExistingRefreshToken });
      const nonce = 'page-nonce';
      const nonceCookie = encodeURIComponent(
        JSON.stringify([{ value: nonce, issuedAt: Date.now() }])
      );
      const request = {
        headers: {
          cookie: `idp-owox-social-intent=${nonceCookie}; idp-owox-state=old-state; refreshToken=existing`,
        },
        query: {},
        body: { provider: 'google', nonce },
        protocol: 'https',
        hostname: 'app.test',
        path: '/auth/sign-in/social-intent',
      } as unknown as Request;
      const response = createResponse();

      await provider['handleSocialIntent'](request, response, 'https://platform.test/auth/sign-in');

      expect(handleExistingRefreshToken).not.toHaveBeenCalled();
      expect(response.clearCookie).toHaveBeenCalledWith(
        'idp-owox-state',
        expect.objectContaining({ path: '/' })
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
      expect(response.redirect).toHaveBeenCalledWith(
        expect.stringContaining('https://platform.test/auth/sign-in')
      );
    });

    it('rejects a provider request without the nonce from a rendered page', async () => {
      const provider = createProvider();
      const request = {
        headers: { cookie: '' },
        query: {},
        body: { provider: 'microsoft', nonce: 'forged' },
      } as unknown as Request;
      const response = createResponse();

      await provider['handleSocialIntent'](request, response, 'https://platform.test/auth/sign-in');

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

      await provider['handleSocialIntent'](request, response, 'https://platform.test/auth/sign-in');

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

      await provider['handleSocialIntent'](request, response, 'https://platform.test/auth/sign-in');

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

      expect(provider['pageController'].signUpPage).toHaveBeenCalledWith(request, response);
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

      expect(provider['pageController'].signUpPage).toHaveBeenCalledWith(request, response);
      expect(response.redirect).not.toHaveBeenCalled();
    });

    it('still bounces to Platform when a refresh token establishes an existing session, even without pendingAction', async () => {
      const provider = createProvider();
      const request = {
        headers: { cookie: 'refreshToken=refresh-token-1' },
        query: {},
      } as unknown as Request;
      const response = createResponse();

      await provider.signUpMiddleware(request, response, jest.fn());

      expect(provider['pageController'].signUpPage).not.toHaveBeenCalled();
      expect(response.redirect).toHaveBeenCalledWith(
        expect.stringContaining('https://platform.test/auth/sign-up')
      );
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

      expect(provider['pageController'].signUpPage).toHaveBeenCalledWith(request, response);
      expect(response.redirect).not.toHaveBeenCalled();
    });

    it('still bounces when this request itself carries projectId in the query', async () => {
      const provider = createProvider();
      const request = {
        headers: { cookie: '' },
        query: { projectId: 'project-1' },
      } as unknown as Request;
      const response = createResponse();

      await provider.signUpMiddleware(request, response, jest.fn());

      expect(provider['pageController'].signUpPage).not.toHaveBeenCalled();
      expect(response.redirect).toHaveBeenCalledWith(
        expect.stringContaining('https://platform.test/auth/sign-up')
      );
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

  describe('/auth/callback error paths', () => {
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
          appRedirectTo: '/auth/idp-start?projectId=project-1',
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
