import { describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { AUTH_BASE_PATH } from './core/constants.js';
import { OwoxBetterAuthIdp } from './owox-better-auth-idp.js';

type RouteHandler = (req: Request, res: Response) => Promise<void>;

function createResponse(): Response {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    redirect: jest.fn(),
  } as unknown as Response;
}

function createCallbackProvider(overrides: Record<string, unknown> = {}): {
  provider: OwoxBetterAuthIdp;
  callback: RouteHandler;
} {
  const routes = new Map<string, RouteHandler>();
  const app = {
    use: jest.fn(),
    get: jest.fn((path: string, handler: RouteHandler) => routes.set(path, handler)),
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
  return { provider, callback };
}

function createProvider(overrides: Record<string, unknown> = {}): OwoxBetterAuthIdp {
  return Object.assign(Object.create(OwoxBetterAuthIdp.prototype), {
    pageController: {
      signInPage: jest.fn().mockResolvedValue(undefined),
      signUpPage: jest.fn().mockResolvedValue(undefined),
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

    it('starts the Platform PKCE round trip when the request carries an explicit pendingAction', async () => {
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
      expect(response.clearCookie).toHaveBeenCalledWith(
        'idp-owox-state',
        expect.objectContaining({ path: '/' })
      );
      // pendingAction must survive into the persisted params cookie so it can
      // be resumed once state comes back from Platform.
      expect(response.cookie).toHaveBeenCalledWith(
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

    it('starts the Platform PKCE round trip when the request carries an explicit pendingAction', async () => {
      const provider = createProvider();
      const request = {
        headers: { cookie: 'idp-owox-state=page-load-state' },
        query: { pendingAction: 'microsoft' },
      } as unknown as Request;
      const response = createResponse();

      await provider.signUpMiddleware(request, response, jest.fn());

      expect(provider['pageController'].signUpPage).not.toHaveBeenCalled();
      expect(response.redirect).toHaveBeenCalledWith(
        expect.stringContaining('https://platform.test/auth/sign-up')
      );
      expect(response.clearCookie).toHaveBeenCalledWith(
        'idp-owox-state',
        expect.objectContaining({ path: '/' })
      );
      expect(response.cookie).toHaveBeenCalledWith(
        'idp-owox-params',
        expect.stringContaining('pendingAction'),
        expect.anything()
      );
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
    it('clears auth-flow cookies and shows an error when the callback is missing a code', async () => {
      const { callback } = createCallbackProvider();
      const request = {
        path: `${AUTH_BASE_PATH}/callback`,
        headers: { cookie: '' },
        query: {},
      } as unknown as Request;
      const response = createResponse();

      await callback(request, response);

      const clearedCookies = (response.clearCookie as jest.Mock).mock.calls.map(call => call[0]);
      expect(clearedCookies).toEqual(expect.arrayContaining(['idp-owox-state', 'idp-owox-params']));
      expect(response.redirect).toHaveBeenCalledWith(expect.stringContaining('error='));
    });

    it('clears auth-flow cookies and shows an error when the token exchange throws (e.g. a dead state)', async () => {
      const { callback } = createCallbackProvider();
      const request = {
        path: `${AUTH_BASE_PATH}/callback`,
        headers: { cookie: '' },
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
