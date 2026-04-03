import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { CryptoService } from './crypto-service.js';
import type { UserManagementService } from './user-management-service.js';

// Dynamic imports to respect jest.setup.ts logger mock
const { TokenService } = await import('./token-service.js');

function createCryptoServiceMock(): jest.Mocked<CryptoService> {
  return {
    encrypt: jest.fn<CryptoService['encrypt']>(),
    decrypt: jest.fn<CryptoService['decrypt']>(),
  } as unknown as jest.Mocked<CryptoService>;
}

function createUserManagementServiceMock(): jest.Mocked<
  Pick<UserManagementService, 'getUserRole'>
> {
  return {
    getUserRole: jest.fn<UserManagementService['getUserRole']>(),
  } as unknown as jest.Mocked<Pick<UserManagementService, 'getUserRole'>>;
}

function createAuthMock(
  sessionData?: {
    user: { id: string; email: string; name: string };
    session: { token: string };
  } | null,
  options?: { secure?: boolean }
) {
  return {
    options: {
      advanced: {
        cookies: {
          session_token: { attributes: { secure: options?.secure ?? false } },
        },
      },
    },
    api: {
      getSession: jest
        .fn<() => Promise<typeof sessionData>>()
        .mockResolvedValue(sessionData ?? null),
      signOut: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
  };
}

describe('TokenService', () => {
  let cryptoService: jest.Mocked<CryptoService>;
  let userManagementService: jest.Mocked<Pick<UserManagementService, 'getUserRole'>>;

  beforeEach(() => {
    cryptoService = createCryptoServiceMock();
    userManagementService = createUserManagementServiceMock();
    jest.clearAllMocks();
  });

  describe('introspectToken', () => {
    it('should decrypt token and return payload from JSON', async () => {
      const payload = {
        userId: 'user-1',
        projectId: '0',
        email: 'test@example.com',
        fullName: 'Test User',
        roles: ['admin'],
      };
      cryptoService.decrypt.mockResolvedValue(JSON.stringify(payload));

      const auth = createAuthMock();
      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      const result = await service.introspectToken('Bearer some-encrypted-token');

      expect(cryptoService.decrypt).toHaveBeenCalledWith('some-encrypted-token');
      expect(result).toEqual(payload);
    });

    it('should strip Bearer prefix before decrypting', async () => {
      const payload = { userId: 'user-1', projectId: '0', email: 'a@b.com', fullName: 'A' };
      cryptoService.decrypt.mockResolvedValue(JSON.stringify(payload));

      const auth = createAuthMock();
      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      await service.introspectToken('Bearer encrypted-token');

      expect(cryptoService.decrypt).toHaveBeenCalledWith('encrypted-token');
    });

    it('should return null when payload has no userId', async () => {
      cryptoService.decrypt.mockResolvedValue(JSON.stringify({ projectId: '0' }));

      const auth = createAuthMock();
      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      const result = await service.introspectToken('token');

      expect(result).toBeNull();
    });

    it('should throw when decryption fails', async () => {
      cryptoService.decrypt.mockRejectedValue(new Error('Decryption failed'));

      const auth = createAuthMock();
      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      await expect(service.introspectToken('bad-token')).rejects.toThrow(
        'Token introspection failed'
      );
    });

    it('should throw when JSON parsing fails', async () => {
      cryptoService.decrypt.mockResolvedValue('not-json');

      const auth = createAuthMock();
      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      await expect(service.introspectToken('token')).rejects.toThrow('Token introspection failed');
    });

    it('should pass through extra/unexpected fields in payload', async () => {
      const payload = {
        userId: 'user-1',
        projectId: '0',
        email: 'a@b.com',
        fullName: 'A',
        customField: 'custom-value',
        nestedObject: { key: 'value' },
      };
      cryptoService.decrypt.mockResolvedValue(JSON.stringify(payload));

      const auth = createAuthMock();
      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      const result = await service.introspectToken('Bearer token');

      expect(result).toEqual(payload);
      expect((result as Record<string, unknown>).customField).toBe('custom-value');
      expect((result as Record<string, unknown>).nestedObject).toEqual({ key: 'value' });
    });

    it('should return null when userId is empty string', async () => {
      cryptoService.decrypt.mockResolvedValue(
        JSON.stringify({ userId: '', projectId: '0', email: 'a@b.com' })
      );

      const auth = createAuthMock();
      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      const result = await service.introspectToken('token');

      expect(result).toBeNull();
    });

    it('should work when token has no Bearer prefix', async () => {
      const payload = { userId: 'user-1', projectId: '0', email: 'a@b.com', fullName: 'A' };
      cryptoService.decrypt.mockResolvedValue(JSON.stringify(payload));

      const auth = createAuthMock();
      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      await service.introspectToken('raw-encrypted-token');

      expect(cryptoService.decrypt).toHaveBeenCalledWith('raw-encrypted-token');
    });

    it('should NOT call auth.api.getSession during introspection', async () => {
      const payload = { userId: 'user-1', projectId: '0', email: 'a@b.com', fullName: 'A' };
      cryptoService.decrypt.mockResolvedValue(JSON.stringify(payload));

      const auth = createAuthMock();
      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      await service.introspectToken('Bearer token');

      expect(auth.api.getSession).not.toHaveBeenCalled();
    });

    it('should throw on empty string payload', async () => {
      cryptoService.decrypt.mockResolvedValue('');

      const auth = createAuthMock();
      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      await expect(service.introspectToken('token')).rejects.toThrow('Token introspection failed');
    });

    it('should throw on JSON array payload', async () => {
      cryptoService.decrypt.mockResolvedValue('[1, 2, 3]');

      const auth = createAuthMock();
      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      const result = await service.introspectToken('token');

      expect(result).toBeNull();
    });

    it('should throw on JSON null payload', async () => {
      cryptoService.decrypt.mockResolvedValue('null');

      const auth = createAuthMock();
      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      const result = await service.introspectToken('token');

      expect(result).toBeNull();
    });
  });

  describe('parseToken', () => {
    it('should delegate to introspectToken', async () => {
      const payload = { userId: 'user-1', projectId: '0', email: 'a@b.com', fullName: 'A' };
      cryptoService.decrypt.mockResolvedValue(JSON.stringify(payload));

      const auth = createAuthMock();
      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      const result = await service.parseToken('token');

      expect(result).toEqual(payload);
    });
  });

  describe('refreshToken', () => {
    it('should return encrypted payload with user data and role', async () => {
      const sessionData = {
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
        session: { token: 'session-token-123' },
      };
      const auth = createAuthMock(sessionData);
      (userManagementService.getUserRole as jest.Mock).mockResolvedValue('admin');
      cryptoService.encrypt.mockResolvedValue('encrypted-payload');

      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      const result = await service.refreshToken('refresh-token-value');

      expect(auth.api.getSession).toHaveBeenCalled();
      expect(userManagementService.getUserRole).toHaveBeenCalledWith('user-1');
      expect(cryptoService.encrypt).toHaveBeenCalledWith(
        JSON.stringify({
          userId: 'user-1',
          projectId: '0',
          email: 'test@example.com',
          fullName: 'Test User',
          roles: ['admin'],
        })
      );
      expect(result).toEqual({ accessToken: 'encrypted-payload' });
    });

    it('should omit roles when user has no role', async () => {
      const sessionData = {
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
        session: { token: 'session-token-123' },
      };
      const auth = createAuthMock(sessionData);
      (userManagementService.getUserRole as jest.Mock).mockResolvedValue(null);
      cryptoService.encrypt.mockResolvedValue('encrypted-payload');

      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      await service.refreshToken('refresh-token-value');

      expect(cryptoService.encrypt).toHaveBeenCalledWith(
        JSON.stringify({
          userId: 'user-1',
          projectId: '0',
          email: 'test@example.com',
          fullName: 'Test User',
        })
      );
    });

    it('should use email as fullName when name is missing', async () => {
      const sessionData = {
        user: { id: 'user-1', email: 'test@example.com', name: '' },
        session: { token: 'session-token-123' },
      };
      const auth = createAuthMock(sessionData);
      (userManagementService.getUserRole as jest.Mock).mockResolvedValue(null);
      cryptoService.encrypt.mockResolvedValue('encrypted');

      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      await service.refreshToken('token');

      const encryptCall = cryptoService.encrypt.mock.calls[0]![0] as string;
      const parsed = JSON.parse(encryptCall);
      expect(parsed.fullName).toBe('test@example.com');
    });

    it('should throw when no session found', async () => {
      const auth = createAuthMock(null);
      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      await expect(service.refreshToken('bad-token')).rejects.toThrow('Token refresh failed');
    });

    it('should use __Secure- prefix for cookie when secure flag is true', async () => {
      const sessionData = {
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
        session: { token: 'session-token-123' },
      };
      const auth = createAuthMock(sessionData, { secure: true });
      (userManagementService.getUserRole as jest.Mock).mockResolvedValue('editor');
      cryptoService.encrypt.mockResolvedValue('encrypted');

      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      await service.refreshToken('refresh-token-value');

      const cookieHeader = (
        auth.api.getSession.mock.calls[0] as [{ headers: Headers }]
      )[0].headers.get('Cookie');
      expect(cookieHeader).toBe('__Secure-refreshToken=refresh-token-value');
    });

    it('should not use __Secure- prefix for cookie when secure flag is false', async () => {
      const sessionData = {
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
        session: { token: 'session-token-123' },
      };
      const auth = createAuthMock(sessionData, { secure: false });
      (userManagementService.getUserRole as jest.Mock).mockResolvedValue('editor');
      cryptoService.encrypt.mockResolvedValue('encrypted');

      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      await service.refreshToken('refresh-token-value');

      const cookieHeader = (
        auth.api.getSession.mock.calls[0] as [{ headers: Headers }]
      )[0].headers.get('Cookie');
      expect(cookieHeader).toBe('refreshToken=refresh-token-value');
    });

    it('should encrypt JSON payload, not raw session token', async () => {
      const sessionData = {
        user: { id: 'user-42', email: 'json@test.com', name: 'JSON Test' },
        session: { token: 'raw-session-token-xyz' },
      };
      const auth = createAuthMock(sessionData);
      (userManagementService.getUserRole as jest.Mock).mockResolvedValue('viewer');
      cryptoService.encrypt.mockResolvedValue('encrypted');

      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      await service.refreshToken('refresh');

      const encryptArg = cryptoService.encrypt.mock.calls[0]![0] as string;
      const parsed = JSON.parse(encryptArg);
      expect(parsed).toEqual({
        userId: 'user-42',
        projectId: '0',
        email: 'json@test.com',
        fullName: 'JSON Test',
        roles: ['viewer'],
      });
      expect(encryptArg).not.toBe('raw-session-token-xyz');
    });
  });

  describe('revokeToken', () => {
    it('should decrypt token, find session, and call signOut', async () => {
      const sessionData = {
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
        session: { token: 'session-token' },
      };
      const auth = createAuthMock(sessionData);
      cryptoService.decrypt.mockResolvedValue('decrypted-token-value');

      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      await service.revokeToken('Bearer encrypted-token');

      expect(cryptoService.decrypt).toHaveBeenCalledWith('encrypted-token');
      expect(auth.api.getSession).toHaveBeenCalled();
      expect(auth.api.signOut).toHaveBeenCalled();
    });

    it('should not call signOut when session is not found', async () => {
      const auth = createAuthMock(null);
      cryptoService.decrypt.mockResolvedValue('decrypted-token-value');

      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      await service.revokeToken('Bearer encrypted-token');

      expect(auth.api.getSession).toHaveBeenCalled();
      expect(auth.api.signOut).not.toHaveBeenCalled();
    });

    it('should throw when decryption fails', async () => {
      cryptoService.decrypt.mockRejectedValue(new Error('Bad decrypt'));

      const auth = createAuthMock();
      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      await expect(service.revokeToken('bad-token')).rejects.toThrow('Failed to revoke token');
    });

    it('should strip Bearer prefix before decrypting', async () => {
      const auth = createAuthMock(null);
      cryptoService.decrypt.mockResolvedValue('decrypted');

      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      await service.revokeToken('Bearer my-encrypted-token');

      expect(cryptoService.decrypt).toHaveBeenCalledWith('my-encrypted-token');
    });

    it('should use __Secure- prefix for cookies when secure flag is true', async () => {
      const sessionData = {
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
        session: { token: 'session-token' },
      };
      const auth = createAuthMock(sessionData, { secure: true });
      cryptoService.decrypt.mockResolvedValue('decrypted-token');

      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      await service.revokeToken('token');

      const getSessionCall = (auth.api.getSession.mock.calls[0] as [{ headers: Headers }])[0];
      expect(getSessionCall.headers.get('Cookie')).toContain('__Secure-refreshToken=');

      const signOutCall = (auth.api.signOut.mock.calls[0] as [{ headers: Headers }])[0];
      expect(signOutCall.headers.get('Cookie')).toContain('__Secure-refreshToken=');
    });
  });

  describe('round-trip: generateAccessToken -> introspectToken', () => {
    it('should produce a token that introspectToken can decode', async () => {
      const expectedPayload = {
        userId: 'user-1',
        projectId: '0',
        email: 'test@example.com',
        fullName: 'Test User',
        roles: ['admin'],
      };

      let stored = '';
      cryptoService.encrypt.mockImplementation(async (data: string) => {
        stored = data;
        return 'encrypted-token';
      });
      cryptoService.decrypt.mockImplementation(async () => stored);

      const sessionData = {
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
        session: { token: 'session-token' },
      };
      const auth = createAuthMock(sessionData);
      (userManagementService.getUserRole as jest.Mock).mockResolvedValue('admin');

      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      const { accessToken } = await service.refreshToken('refresh');

      const result = await service.introspectToken(accessToken);

      expect(result).toEqual(expectedPayload);
    });

    it('should preserve all roles through the round-trip', async () => {
      let stored = '';
      cryptoService.encrypt.mockImplementation(async (data: string) => {
        stored = data;
        return 'enc';
      });
      cryptoService.decrypt.mockImplementation(async () => stored);

      const sessionData = {
        user: { id: 'u1', email: 'a@b.com', name: 'A' },
        session: { token: 'st' },
      };
      const auth = createAuthMock(sessionData);
      (userManagementService.getUserRole as jest.Mock).mockResolvedValue('viewer');

      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      const { accessToken } = await service.refreshToken('r');
      const result = await service.introspectToken(accessToken);

      expect(result!.roles).toEqual(['viewer']);
    });

    it('should handle payload without roles through the round-trip', async () => {
      let stored = '';
      cryptoService.encrypt.mockImplementation(async (data: string) => {
        stored = data;
        return 'enc';
      });
      cryptoService.decrypt.mockImplementation(async () => stored);

      const sessionData = {
        user: { id: 'u1', email: 'a@b.com', name: 'A' },
        session: { token: 'st' },
      };
      const auth = createAuthMock(sessionData);
      (userManagementService.getUserRole as jest.Mock).mockResolvedValue(null);

      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      const { accessToken } = await service.refreshToken('r');
      const result = await service.introspectToken(accessToken);

      expect(result!.userId).toBe('u1');
      expect(result!.roles).toBeUndefined();
    });
  });

  describe('concurrent token operations', () => {
    it('should handle multiple concurrent introspectToken calls independently', async () => {
      const payload1 = { userId: 'user-1', projectId: '0', email: 'a@b.com', fullName: 'A' };
      const payload2 = { userId: 'user-2', projectId: '1', email: 'c@d.com', fullName: 'C' };

      let callCount = 0;
      cryptoService.decrypt.mockImplementation(async () => {
        callCount++;
        return callCount === 1 ? JSON.stringify(payload1) : JSON.stringify(payload2);
      });

      const auth = createAuthMock();
      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      const [result1, result2] = await Promise.all([
        service.introspectToken('token-1'),
        service.introspectToken('token-2'),
      ]);

      expect(result1).toEqual(payload1);
      expect(result2).toEqual(payload2);
      expect(cryptoService.decrypt).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed success and failure in concurrent refreshToken calls', async () => {
      const sessionData = {
        user: { id: 'u1', email: 'a@b.com', name: 'A' },
        session: { token: 'st' },
      };

      let callCount = 0;
      const auth = createAuthMock(null);
      auth.api.getSession.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return sessionData;
        return null;
      });
      (userManagementService.getUserRole as jest.Mock).mockResolvedValue('admin');
      cryptoService.encrypt.mockResolvedValue('enc');

      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      const results = await Promise.allSettled([
        service.refreshToken('good-token'),
        service.refreshToken('bad-token'),
      ]);

      expect(results[0]!.status).toBe('fulfilled');
      expect(results[1]!.status).toBe('rejected');
    });
  });

  describe('introspectToken edge cases', () => {
    it('should handle payload with unicode characters', async () => {
      const payload = {
        userId: 'u1',
        projectId: '0',
        email: 'тест@приклад.com',
        fullName: 'Тест Юзер',
      };
      cryptoService.decrypt.mockResolvedValue(JSON.stringify(payload));

      const auth = createAuthMock();
      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      const result = await service.introspectToken('token');

      expect(result!.fullName).toBe('Тест Юзер');
      expect(result!.email).toBe('тест@приклад.com');
    });

    it('should handle payload with very long strings', async () => {
      const longEmail = 'a'.repeat(1000) + '@example.com';
      const payload = { userId: 'u1', projectId: '0', email: longEmail, fullName: 'A' };
      cryptoService.decrypt.mockResolvedValue(JSON.stringify(payload));

      const auth = createAuthMock();
      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      const result = await service.introspectToken('token');

      expect(result!.email).toBe(longEmail);
    });

    it('should handle multiple Bearer prefixes by only stripping the first', async () => {
      const payload = { userId: 'u1', projectId: '0', email: 'a@b.com', fullName: 'A' };
      cryptoService.decrypt.mockResolvedValue(JSON.stringify(payload));

      const auth = createAuthMock();
      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      await service.introspectToken('Bearer Bearer double-prefix');

      expect(cryptoService.decrypt).toHaveBeenCalledWith('Bearer double-prefix');
    });

    it('should return null for payload with userId set to undefined', async () => {
      cryptoService.decrypt.mockResolvedValue(
        JSON.stringify({ userId: undefined, projectId: '0' })
      );

      const auth = createAuthMock();
      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      const result = await service.introspectToken('token');

      expect(result).toBeNull();
    });

    it('should handle numeric userId (non-string) in payload', async () => {
      cryptoService.decrypt.mockResolvedValue(
        JSON.stringify({ userId: 12345, projectId: '0', email: 'a@b.com', fullName: 'A' })
      );

      const auth = createAuthMock();
      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      const result = await service.introspectToken('token');

      expect(result).not.toBeNull();
      expect(result!.userId).toBe(12345);
    });
  });

  describe('refreshToken edge cases', () => {
    it('should call getUserRole with correct userId from session', async () => {
      const sessionData = {
        user: { id: 'specific-user-id-xyz', email: 'a@b.com', name: 'A' },
        session: { token: 'st' },
      };
      const auth = createAuthMock(sessionData);
      (userManagementService.getUserRole as jest.Mock).mockResolvedValue('editor');
      cryptoService.encrypt.mockResolvedValue('enc');

      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      await service.refreshToken('refresh');

      expect(userManagementService.getUserRole).toHaveBeenCalledWith('specific-user-id-xyz');
    });

    it('should throw when getUserRole fails', async () => {
      const sessionData = {
        user: { id: 'u1', email: 'a@b.com', name: 'A' },
        session: { token: 'st' },
      };
      const auth = createAuthMock(sessionData);
      (userManagementService.getUserRole as jest.Mock).mockRejectedValue(new Error('DB error'));

      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      await expect(service.refreshToken('token')).rejects.toThrow('Token refresh failed');
    });

    it('should throw when encrypt fails', async () => {
      const sessionData = {
        user: { id: 'u1', email: 'a@b.com', name: 'A' },
        session: { token: 'st' },
      };
      const auth = createAuthMock(sessionData);
      (userManagementService.getUserRole as jest.Mock).mockResolvedValue('admin');
      cryptoService.encrypt.mockRejectedValue(new Error('Encryption error'));

      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      await expect(service.refreshToken('token')).rejects.toThrow('Token refresh failed');
    });

    it('should always set projectId to DEFAULT_ORGANIZATION_ID (0)', async () => {
      const sessionData = {
        user: { id: 'u1', email: 'a@b.com', name: 'A' },
        session: { token: 'st' },
      };
      const auth = createAuthMock(sessionData);
      (userManagementService.getUserRole as jest.Mock).mockResolvedValue(null);
      cryptoService.encrypt.mockResolvedValue('enc');

      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      await service.refreshToken('token');

      const parsed = JSON.parse(cryptoService.encrypt.mock.calls[0]![0] as string);
      expect(parsed.projectId).toBe('0');
    });
  });

  describe('revokeToken edge cases', () => {
    it('should not throw when session exists but signOut fails', async () => {
      const sessionData = {
        user: { id: 'u1', email: 'a@b.com', name: 'A' },
        session: { token: 'st' },
      };
      const auth = createAuthMock(sessionData);
      auth.api.signOut.mockRejectedValue(new Error('signOut failed'));
      cryptoService.decrypt.mockResolvedValue('decrypted');

      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      await expect(service.revokeToken('token')).rejects.toThrow('Failed to revoke token');
    });

    it('should pass both Authorization and Cookie headers to getSession', async () => {
      const auth = createAuthMock(null);
      cryptoService.decrypt.mockResolvedValue('decrypted-token-value');

      const service = new TokenService(
        auth as never,
        cryptoService,
        userManagementService as never
      );

      await service.revokeToken('Bearer enc');

      const getSessionCall = (auth.api.getSession.mock.calls[0] as [{ headers: Headers }])[0];
      expect(getSessionCall.headers.get('Authorization')).toBe('Bearer decrypted-token-value');
      expect(getSessionCall.headers.get('Cookie')).toContain('refreshToken=decrypted-token-value');
    });
  });
});
