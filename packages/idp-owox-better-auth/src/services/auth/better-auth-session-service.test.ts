import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createBetterAuthConfig } from '../../config/idp-better-auth-config.js';
import { BETTER_AUTH_SESSION_COOKIE } from '../../core/constants.js';
import type { DatabaseStore } from '../../store/database-store.js';
import { BetterAuthSessionService } from './better-auth-session-service.js';
import type { PlatformAuthFlowClient } from './platform-auth-flow-client.js';

type BetterAuthInstance = Awaited<ReturnType<typeof createBetterAuthConfig>>;

describe('BetterAuthSessionService', () => {
  let auth: jest.Mocked<BetterAuthInstance>;
  let getSessionMock: jest.Mock;
  let store: jest.Mocked<DatabaseStore>;
  let platformAuthFlowClient: jest.Mocked<PlatformAuthFlowClient>;
  let service: BetterAuthSessionService;
  let sessionTokenAttributes: { secure: boolean };

  beforeEach(() => {
    sessionTokenAttributes = { secure: true };
    auth = {
      api: {
        getSession: jest.fn(),
      },
      options: {
        advanced: {
          cookies: {
            session_token: {
              attributes: sessionTokenAttributes,
            },
          },
        },
      },
    } as unknown as jest.Mocked<BetterAuthInstance>;

    store = {
      getUserById: jest.fn(),
      getAccountByUserId: jest.fn(),
    } as unknown as jest.Mocked<DatabaseStore>;

    platformAuthFlowClient = {
      completeAuthFlow: jest.fn(),
    } as unknown as jest.Mocked<PlatformAuthFlowClient>;

    getSessionMock = auth.api.getSession as unknown as jest.Mock;
    service = new BetterAuthSessionService(auth, store, platformAuthFlowClient);
  });

  const getCookieHeaderFromCall = (callIndex: number): string | null => {
    const call = getSessionMock.mock.calls[callIndex] as [{ headers: Headers }] | undefined;
    expect(call).toBeDefined();
    if (!call) {
      return null;
    }
    return call[0].headers.get('cookie');
  };

  it('uses __Secure session cookie name when secure cookies are enabled', async () => {
    getSessionMock.mockImplementation(async (context: unknown) => {
      const headers = (context as { headers: Headers }).headers;
      const cookie = headers.get('cookie');
      if (cookie === `__Secure-${BETTER_AUTH_SESSION_COOKIE}=session-token`) {
        return {
          user: { id: 'u1', email: 'user@test.com', name: 'User Test' },
          session: { id: 's1', userId: 'u1', token: 'session-token', expiresAt: '2030-01-01' },
        };
      }
      return null;
    });
    store.getUserById.mockResolvedValue({
      id: 'u1',
      email: 'user@test.com',
      name: 'User Test',
      image: null,
    });
    store.getAccountByUserId.mockResolvedValue({
      id: 'a1',
      userId: 'u1',
      providerId: 'google',
      accountId: 'google-u1',
    });
    platformAuthFlowClient.completeAuthFlow.mockResolvedValue({ code: 'auth-code-1' });

    const result = await service.completeAuthFlowWithSessionToken('session-token', 'state-1');

    expect(result.code).toBe('auth-code-1');
    expect(auth.api.getSession).toHaveBeenCalledTimes(1);
    expect(getCookieHeaderFromCall(0)).toBe(`__Secure-${BETTER_AUTH_SESSION_COOKIE}=session-token`);
  });

  it('falls back to prefixed cookie name when initial cookie name fails', async () => {
    sessionTokenAttributes.secure = false;

    getSessionMock.mockImplementation(async (context: unknown) => {
      const headers = (context as { headers: Headers }).headers;
      const cookie = headers.get('cookie');
      if (cookie === `${BETTER_AUTH_SESSION_COOKIE}=session-token`) {
        return null;
      }
      if (cookie === `__Secure-${BETTER_AUTH_SESSION_COOKIE}=session-token`) {
        return {
          user: { id: 'u2', email: 'second@test.com', name: 'Second User' },
          session: { id: 's2', userId: 'u2', token: 'session-token', expiresAt: '2030-01-01' },
        };
      }
      return null;
    });
    store.getUserById.mockResolvedValue({
      id: 'u2',
      email: 'second@test.com',
      name: 'Second User',
      image: null,
    });
    store.getAccountByUserId.mockResolvedValue({
      id: 'a2',
      userId: 'u2',
      providerId: 'google',
      accountId: 'google-u2',
    });
    platformAuthFlowClient.completeAuthFlow.mockResolvedValue({ code: 'auth-code-2' });

    const result = await service.completeAuthFlowWithSessionToken('session-token', 'state-2');

    expect(result.code).toBe('auth-code-2');
    expect(getSessionMock).toHaveBeenCalledTimes(2);
    expect(getCookieHeaderFromCall(0)).toBe(`${BETTER_AUTH_SESSION_COOKIE}=session-token`);
    expect(getCookieHeaderFromCall(1)).toBe(`__Secure-${BETTER_AUTH_SESSION_COOKIE}=session-token`);
  });
});
