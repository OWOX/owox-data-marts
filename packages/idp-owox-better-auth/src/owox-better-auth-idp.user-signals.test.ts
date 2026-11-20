import { describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { AUTH_BASE_PATH } from './core/constants.js';
import { OwoxBetterAuthIdp } from './owox-better-auth-idp.js';
import { ServerEventsService } from './services/analytics/server-events-service.js';
import { UserSignalsService } from './services/signals/user-signals-service.js';
import type { DatabaseStore } from './store/database-store.js';

type RouteHandler = (req: Request, res: Response) => Promise<void>;

const PRODUCT_INTENT = { cookiePrefix: 'app_', cookieDomain: 'example.com' };
const INTENT_COOKIES = 'app_destination=looker-studio; app_source=facebook-ads';
const STORED_SIGNAL = {
  name: 'product_intent',
  value: JSON.stringify({ destination: 'looker-studio', source: 'facebook-ads' }),
  origin: 'explicit_click',
  firstSeenAt: '2026-01-01T00:00:00.000Z',
  lastSeenAt: '2026-01-02T00:00:00.000Z',
  seenCount: 2,
};
const PAYLOAD = { userId: 'user-1', projectId: 'project-1', email: 'user@example.com' };

function createStore(overrides: Record<string, unknown> = {}) {
  return {
    recordUserSignal: jest.fn().mockResolvedValue(undefined),
    getUserSignals: jest.fn().mockResolvedValue([STORED_SIGNAL]),
    ...overrides,
  };
}

function createProvider(options: {
  productIntent?: typeof PRODUCT_INTENT;
  store?: ReturnType<typeof createStore>;
  tokenFacade?: Record<string, unknown>;
}) {
  const store = options.store ?? createStore();
  const tokenFacade = {
    changeAuthCode: jest.fn().mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      refreshTokenExpiresIn: 3600,
    }),
    refreshToken: jest.fn().mockResolvedValue({ accessToken: 'access-token' }),
    setTokenToCookie: jest.fn(),
    parseToken: jest.fn().mockResolvedValue(PAYLOAD),
    ...options.tokenFacade,
  };
  const routes = new Map<string, RouteHandler>();
  const app = {
    use: jest.fn(),
    post: jest.fn(),
    get: jest.fn((path: string, handler: RouteHandler) => routes.set(path, handler)),
  };
  const provider = Object.assign(Object.create(OwoxBetterAuthIdp.prototype), {
    serverEvents: new ServerEventsService(undefined),
    userSignals: new UserSignalsService(options.productIntent, store as unknown as DatabaseStore),
    betterAuthProxyHandler: { setupBetterAuthHandler: jest.fn() },
    authErrorController: { registerRoutes: jest.fn() },
    onboardingController: { registerRoutes: jest.fn() },
    pageController: { registerRoutes: jest.fn() },
    passwordFlowController: { registerRoutes: jest.fn() },
    googleSheetsAuthController: { registerRoutes: jest.fn() },
    authFlowMiddleware: { idpStartMiddleware: jest.fn() },
    tokenFacade,
    parseToken: jest.fn().mockResolvedValue(PAYLOAD),
    userAuthInfoPersistenceService: { persistAuthInfo: jest.fn().mockResolvedValue(undefined) },
    onboardingService: {
      evaluateAndSetOnboardingStatus: jest.fn().mockResolvedValue(undefined),
      shouldShowQuestionnaire: jest.fn().mockResolvedValue(false),
      getAnswersForPayload: jest.fn().mockResolvedValue(null),
    },
    config: {
      productIntent: options.productIntent,
      idpOwox: { baseUrl: 'https://app.test', idpConfig: { allowedRedirectOrigins: [] } },
    },
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  }) as OwoxBetterAuthIdp;
  provider.registerRoutes(app as never);
  return { provider, store, tokenFacade, routes };
}

function createRequest(cookie = '', headers: Record<string, string> = {}): Request {
  return {
    path: `${AUTH_BASE_PATH}/callback`,
    protocol: 'https',
    hostname: 'app.test',
    headers: { cookie, ...headers },
    query: { code: 'code-1', state: 'state-1' },
  } as unknown as Request;
}

function createResponse() {
  const res = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    redirect: jest.fn(),
    status: jest.fn(),
    json: jest.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

async function callUserApi(provider: OwoxBetterAuthIdp, req: Request) {
  const res = createResponse();
  await provider.userApiMiddleware(
    req,
    res as unknown as Response,
    jest.fn() as unknown as Parameters<OwoxBetterAuthIdp['userApiMiddleware']>[2]
  );
  return res;
}

const userRequest = (cookie = '') => createRequest(cookie, { 'x-owox-authorization': 'token' });

describe('OwoxBetterAuthIdp user signals', () => {
  it('returns stored signals with the current user', async () => {
    const { provider } = createProvider({ productIntent: PRODUCT_INTENT });

    const res = await callUserApi(provider, userRequest());

    const body = res.json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body.signals).toEqual([
      {
        name: 'product_intent',
        value: { destination: 'looker-studio', source: 'facebook-ads' },
        origin: 'explicit_click',
        firstSeenAt: STORED_SIGNAL.firstSeenAt,
        lastSeenAt: STORED_SIGNAL.lastSeenAt,
        seenCount: 2,
      },
    ]);
  });

  it('omits signals when the feature is off', async () => {
    const { provider } = createProvider({});

    const res = await callUserApi(provider, userRequest());

    expect(res.json.mock.calls[0]?.[0]).not.toHaveProperty('signals');
  });

  it('records a signal carried by the user request and returns it in the same response', async () => {
    const stored: unknown[] = [];
    const store = createStore({
      recordUserSignal: jest.fn().mockImplementation(async () => {
        stored.push(STORED_SIGNAL);
      }),
      getUserSignals: jest.fn().mockImplementation(async () => stored),
    });
    const { provider } = createProvider({ productIntent: PRODUCT_INTENT, store });

    const res = await callUserApi(provider, userRequest(INTENT_COOKIES));

    expect(store.recordUserSignal).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', name: 'product_intent' })
    );
    const body = res.json.mock.calls[0]?.[0] as { signals: unknown[] };
    expect(body.signals).toHaveLength(1);
  });

  it('still returns the user when signals fail', async () => {
    const store = createStore({
      recordUserSignal: jest.fn().mockRejectedValue(new Error('store down')),
      getUserSignals: jest.fn().mockRejectedValue(new Error('store down')),
    });
    const { provider } = createProvider({ productIntent: PRODUCT_INTENT, store });

    const res = await callUserApi(provider, userRequest(INTENT_COOKIES));

    expect(res.status).not.toHaveBeenCalled();
    const body = res.json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body.userId).toBe('user-1');
    expect(body).not.toHaveProperty('signals');
  });

  it('records a signal on the sign-in callback before redirecting', async () => {
    const { store, routes } = createProvider({ productIntent: PRODUCT_INTENT });
    const callback = routes.get(`${AUTH_BASE_PATH}/callback`) as RouteHandler;
    const res = createResponse();

    await callback(createRequest(INTENT_COOKIES), res as unknown as Response);

    expect(store.recordUserSignal).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' })
    );
    expect(res.clearCookie).toHaveBeenCalledWith('app_destination', {
      domain: 'example.com',
      path: '/',
    });
    expect(res.clearCookie.mock.invocationCallOrder[0]).toBeLessThan(
      res.redirect.mock.invocationCallOrder[0] as number
    );
    expect(res.redirect).toHaveBeenCalled();
  });

  it('records a signal on a silent sign-in', async () => {
    const { provider, store } = createProvider({ productIntent: PRODUCT_INTENT });
    const res = createResponse();

    const handled = await (
      provider as unknown as {
        handleExistingRefreshToken: (
          req: Request,
          res: Response,
          token: string
        ) => Promise<boolean>;
      }
    ).handleExistingRefreshToken(createRequest(INTENT_COOKIES), res as unknown as Response, 'rt');

    expect(handled).toBe(true);
    expect(store.recordUserSignal).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' })
    );
    expect(res.redirect).toHaveBeenCalled();
  });

  it('redirects on a silent sign-in when the access token cannot be parsed', async () => {
    const { provider, store } = createProvider({
      productIntent: PRODUCT_INTENT,
      tokenFacade: { parseToken: jest.fn().mockRejectedValue(new Error('bad token')) },
    });
    const res = createResponse();

    const handled = await (
      provider as unknown as {
        handleExistingRefreshToken: (
          req: Request,
          res: Response,
          token: string
        ) => Promise<boolean>;
      }
    ).handleExistingRefreshToken(createRequest(INTENT_COOKIES), res as unknown as Response, 'rt');

    expect(handled).toBe(true);
    expect(res.redirect).toHaveBeenCalledWith('/');
    expect(store.recordUserSignal).not.toHaveBeenCalled();
  });
});
