import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request } from 'express';
import { createBetterAuthConfig } from '../../config/idp-better-auth-config.js';
import { BETTER_AUTH_SESSION_COOKIE } from '../../core/constants.js';
import type { DatabaseStore } from '../../store/database-store.js';
import type { DatabaseAccount, DatabaseUser } from '../../types/database-models.js';
import { UserAccountResolver } from '../core/user-account-resolver.js';
import { BetterAuthSessionService } from './better-auth-session-service.js';
import type { PlatformAuthFlowClient } from './platform-auth-flow-client.js';

type BetterAuthInstance = Awaited<ReturnType<typeof createBetterAuthConfig>>;

describe('BetterAuthSessionService', () => {
  let auth: jest.Mocked<BetterAuthInstance>;
  let getSessionMock: jest.Mock;
  let platformAuthFlowClient: jest.Mocked<PlatformAuthFlowClient>;
  let userAccountResolver: jest.Mocked<UserAccountResolver>;
  let service: BetterAuthSessionService;
  let sessionTokenAttributes: { secure: boolean };

  const mockUser: DatabaseUser = {
    id: 'u1',
    email: 'user@test.com',
    name: 'User Test',
    image: null,
    lastLoginMethod: 'google',
  };

  const mockAccount: DatabaseAccount = {
    id: 'a1',
    userId: 'u1',
    providerId: 'google',
    accountId: 'google-u1',
  };

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

    platformAuthFlowClient = {
      completeAuthFlow: jest.fn(),
    } as unknown as jest.Mocked<PlatformAuthFlowClient>;

    userAccountResolver = {
      resolveByUserId: jest.fn(),
      resolveByEmail: jest.fn(),
    } as unknown as jest.Mocked<UserAccountResolver>;

    getSessionMock = auth.api.getSession as unknown as jest.Mock;
    service = new BetterAuthSessionService(
      auth,
      {} as unknown as DatabaseStore,
      platformAuthFlowClient,
      userAccountResolver
    );
  });

  const getCookieHeaderFromCall = (callIndex: number): string | null => {
    const call = getSessionMock.mock.calls[callIndex] as [{ headers: Headers }] | undefined;
    expect(call).toBeDefined();
    if (!call) {
      return null;
    }
    return call[0].headers.get('cookie');
  };

  describe('completeAuthFlowWithSessionToken', () => {
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

      userAccountResolver.resolveByUserId.mockResolvedValue({
        user: mockUser,
        account: mockAccount,
      });

      platformAuthFlowClient.completeAuthFlow.mockResolvedValue({ code: 'auth-code-1' });

      const result = await service.completeAuthFlowWithSessionToken('session-token', 'state-1');

      expect(result.code).toBe('auth-code-1');
      expect(auth.api.getSession).toHaveBeenCalledTimes(1);
      expect(getCookieHeaderFromCall(0)).toBe(
        `__Secure-${BETTER_AUTH_SESSION_COOKIE}=session-token`
      );
      expect(userAccountResolver.resolveByUserId).toHaveBeenCalledWith('u1', undefined);
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

      const user2: DatabaseUser = {
        id: 'u2',
        email: 'second@test.com',
        name: 'Second User',
        image: null,
      };

      const account2: DatabaseAccount = {
        id: 'a2',
        userId: 'u2',
        providerId: 'google',
        accountId: 'google-u2',
      };

      userAccountResolver.resolveByUserId.mockResolvedValue({
        user: user2,
        account: account2,
      });

      platformAuthFlowClient.completeAuthFlow.mockResolvedValue({ code: 'auth-code-2' });

      const result = await service.completeAuthFlowWithSessionToken('session-token', 'state-2');

      expect(result.code).toBe('auth-code-2');
      expect(getSessionMock).toHaveBeenCalledTimes(2);
      expect(getCookieHeaderFromCall(0)).toBe(`${BETTER_AUTH_SESSION_COOKIE}=session-token`);
      expect(getCookieHeaderFromCall(1)).toBe(
        `__Secure-${BETTER_AUTH_SESSION_COOKIE}=session-token`
      );
      expect(userAccountResolver.resolveByUserId).toHaveBeenCalledWith('u2', undefined);
    });

    it('passes callbackProviderId as preferredLoginMethod to resolver', async () => {
      (auth.api.getSession as unknown as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          user: { id: 'u1', email: 'user@test.com', name: 'User Test' },
          session: { id: 's1', userId: 'u1', token: 'session-token', expiresAt: '2030-01-01' },
        })
      );

      userAccountResolver.resolveByUserId.mockResolvedValue({
        user: mockUser,
        account: mockAccount,
      });

      platformAuthFlowClient.completeAuthFlow.mockResolvedValue({ code: 'auth-code-1' });

      await service.completeAuthFlowWithSessionToken('session-token', 'state-1', 'github');

      expect(userAccountResolver.resolveByUserId).toHaveBeenCalledWith('u1', 'github');
    });

    it('throws when user or account not found', async () => {
      (auth.api.getSession as unknown as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          user: { id: 'u1', email: 'user@test.com', name: 'User Test' },
          session: { id: 's1', userId: 'u1', token: 'session-token', expiresAt: '2030-01-01' },
        })
      );

      userAccountResolver.resolveByUserId.mockResolvedValue(null);

      await expect(
        service.completeAuthFlowWithSessionToken('session-token', 'state-1')
      ).rejects.toThrow('User or account not found for session u1');
    });

    it('throws when session cannot be resolved', async () => {
      (auth.api.getSession as unknown as jest.Mock).mockImplementation(() => Promise.resolve(null));

      await expect(
        service.completeAuthFlowWithSessionToken('invalid-token', 'state-1')
      ).rejects.toThrow('Failed to resolve session from Better Auth token');

      expect(userAccountResolver.resolveByUserId).not.toHaveBeenCalled();
    });
  });

  describe('buildUserInfoPayload', () => {
    it('throws when no session found', async () => {
      const mockReq = {
        headers: {},
      } as unknown as Request;

      (auth.api.getSession as unknown as jest.Mock).mockImplementation(() => Promise.resolve(null));

      await expect(service.buildUserInfoPayload(mockReq)).rejects.toThrow(
        'No session found for user info'
      );
    });

    it('throws when UserAccountResolver returns null', async () => {
      const mockReq = {
        headers: {
          cookie: `${BETTER_AUTH_SESSION_COOKIE}=valid-session`,
        },
      } as unknown as Request;

      (auth.api.getSession as unknown as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          user: { id: 'u1', email: 'user@test.com', name: 'User Test' },
          session: { id: 's1', userId: 'u1', token: 'valid-session', expiresAt: '2030-01-01' },
        })
      );

      userAccountResolver.resolveByUserId.mockResolvedValue(null);

      await expect(service.buildUserInfoPayload(mockReq)).rejects.toThrow(
        'User or account not found for session u1'
      );
    });
  });
});
