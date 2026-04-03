import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import type { CryptoService } from './crypto-service.js';
import type { UserManagementService } from './user-management-service.js';

const { AuthenticationService } = await import('./authentication-service.js');

function createCryptoServiceMock(): jest.Mocked<CryptoService> {
  return {
    encrypt: jest.fn<CryptoService['encrypt']>(),
    decrypt: jest.fn<CryptoService['decrypt']>(),
  } as unknown as jest.Mocked<CryptoService>;
}

function createAuthMock(
  sessionData?: {
    user: { id: string; email: string; name: string };
    session: { id: string; userId: string; token: string; expiresAt: Date };
  } | null,
  handlerResponse?: globalThis.Response
) {
  return {
    api: {
      getSession: jest.fn().mockResolvedValue(sessionData ?? null),
      signOut: jest.fn().mockResolvedValue(undefined),
    },
    options: {},
    handler: jest
      .fn<() => Promise<globalThis.Response>>()
      .mockResolvedValue(
        handlerResponse ?? new globalThis.Response(JSON.stringify({}), { status: 200 })
      ),
  };
}

function createMockRequest(
  cookies: Record<string, string> = {},
  overrides?: Partial<Request>
): Request {
  return {
    headers: {
      cookie: Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; '),
    },
    cookies,
    body: {},
    query: {},
    protocol: 'http',
    originalUrl: '/',
    url: '/',
    get: jest.fn<(name: string) => string | undefined>().mockReturnValue('localhost:3000'),
    ...overrides,
  } as unknown as Request;
}

function createMockResponse(): {
  res: Response;
  statusCode: number | null;
  jsonData: unknown;
  redirectUrl: string | null;
  headers: Record<string, string>;
  clearedCookies: string[];
} {
  const state = {
    statusCode: null as number | null,
    jsonData: null as unknown,
    redirectUrl: null as string | null,
    headers: {} as Record<string, string>,
    clearedCookies: [] as string[],
  };

  const res = {
    status: jest.fn().mockImplementation((code: number) => {
      state.statusCode = code;
      return res;
    }),
    json: jest.fn().mockImplementation((data: unknown) => {
      state.jsonData = data;
      return res;
    }),
    redirect: jest.fn().mockImplementation((url: string) => {
      state.redirectUrl = url;
      return res;
    }),
    set: jest.fn().mockImplementation((key: string, value: string) => {
      state.headers[key] = value;
      return res;
    }),
    clearCookie: jest.fn().mockImplementation((name: string) => {
      state.clearedCookies.push(name);
      return res;
    }),
  } as unknown as Response;

  return { res, ...state };
}

describe('AuthenticationService', () => {
  let cryptoService: jest.Mocked<CryptoService>;
  let userManagementServiceMock: jest.Mocked<Pick<UserManagementService, 'getUserRole'>>;

  beforeEach(() => {
    cryptoService = createCryptoServiceMock();
    userManagementServiceMock = {
      getUserRole: jest.fn<UserManagementService['getUserRole']>(),
    } as unknown as jest.Mocked<Pick<UserManagementService, 'getUserRole'>>;
    jest.clearAllMocks();
  });

  describe('generateAccessToken', () => {
    it('should encrypt JSON payload with user data and role', async () => {
      const sessionData = {
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
        session: { id: 's1', userId: 'user-1', token: 'session-token', expiresAt: new Date() },
      };
      const auth = createAuthMock(sessionData);
      (userManagementServiceMock.getUserRole as jest.Mock).mockResolvedValue('admin');
      cryptoService.encrypt.mockResolvedValue('encrypted-payload');

      const service = new AuthenticationService(auth as never, cryptoService);
      service.setUserManagementService(userManagementServiceMock as never);

      const req = createMockRequest({ refreshToken: 'some-token' });
      const result = await service.generateAccessToken(req);

      expect(result).toBe('encrypted-payload');
      expect(cryptoService.encrypt).toHaveBeenCalledWith(
        JSON.stringify({
          userId: 'user-1',
          projectId: '0',
          email: 'test@example.com',
          fullName: 'Test User',
          roles: ['admin'],
        })
      );
    });

    it('should omit roles when user has no role', async () => {
      const sessionData = {
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
        session: { id: 's1', userId: 'user-1', token: 'session-token', expiresAt: new Date() },
      };
      const auth = createAuthMock(sessionData);
      (userManagementServiceMock.getUserRole as jest.Mock).mockResolvedValue(null);
      cryptoService.encrypt.mockResolvedValue('encrypted');

      const service = new AuthenticationService(auth as never, cryptoService);
      service.setUserManagementService(userManagementServiceMock as never);

      const req = createMockRequest({ refreshToken: 'some-token' });
      await service.generateAccessToken(req);

      const encryptedData = JSON.parse((cryptoService.encrypt.mock.calls[0] as [string])[0]);
      expect(encryptedData.roles).toBeUndefined();
    });

    it('should use email as fullName when name is empty', async () => {
      const sessionData = {
        user: { id: 'user-1', email: 'test@example.com', name: '' },
        session: { id: 's1', userId: 'user-1', token: 'session-token', expiresAt: new Date() },
      };
      const auth = createAuthMock(sessionData);
      (userManagementServiceMock.getUserRole as jest.Mock).mockResolvedValue(null);
      cryptoService.encrypt.mockResolvedValue('encrypted');

      const service = new AuthenticationService(auth as never, cryptoService);
      service.setUserManagementService(userManagementServiceMock as never);

      const req = createMockRequest({ refreshToken: 'some-token' });
      await service.generateAccessToken(req);

      const encryptedData = JSON.parse((cryptoService.encrypt.mock.calls[0] as [string])[0]);
      expect(encryptedData.fullName).toBe('test@example.com');
    });

    it('should throw when no session found', async () => {
      const auth = createAuthMock(null);

      const service = new AuthenticationService(auth as never, cryptoService);

      const req = createMockRequest({ refreshToken: 'some-token' });

      await expect(service.generateAccessToken(req)).rejects.toThrow(
        'Failed to generate access token'
      );
    });

    it('should work without userManagementService (no roles)', async () => {
      const sessionData = {
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
        session: { id: 's1', userId: 'user-1', token: 'session-token', expiresAt: new Date() },
      };
      const auth = createAuthMock(sessionData);
      cryptoService.encrypt.mockResolvedValue('encrypted');

      const service = new AuthenticationService(auth as never, cryptoService);

      const req = createMockRequest({ refreshToken: 'some-token' });
      await service.generateAccessToken(req);

      const encryptedData = JSON.parse((cryptoService.encrypt.mock.calls[0] as [string])[0]);
      expect(encryptedData.roles).toBeUndefined();
      expect(encryptedData.userId).toBe('user-1');
    });

    it('should encrypt JSON payload not raw session token', async () => {
      const sessionData = {
        user: { id: 'user-99', email: 'raw@test.com', name: 'Raw Test' },
        session: {
          id: 's1',
          userId: 'user-99',
          token: 'raw-session-token-abc',
          expiresAt: new Date(),
        },
      };
      const auth = createAuthMock(sessionData);
      (userManagementServiceMock.getUserRole as jest.Mock).mockResolvedValue('editor');
      cryptoService.encrypt.mockResolvedValue('encrypted');

      const service = new AuthenticationService(auth as never, cryptoService);
      service.setUserManagementService(userManagementServiceMock as never);

      const req = createMockRequest({ refreshToken: 'some-token' });
      await service.generateAccessToken(req);

      const encryptArg = (cryptoService.encrypt.mock.calls[0] as [string])[0];
      expect(encryptArg).not.toBe('raw-session-token-abc');
      const parsed = JSON.parse(encryptArg);
      expect(parsed.userId).toBe('user-99');
      expect(parsed.email).toBe('raw@test.com');
    });
  });

  describe('validateSession', () => {
    it('should return isValid true with session data when session exists', async () => {
      const sessionData = {
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
        session: { id: 's1', userId: 'user-1', token: 'tok', expiresAt: new Date() },
      };
      const auth = createAuthMock(sessionData);
      const service = new AuthenticationService(auth as never, cryptoService);

      const req = createMockRequest({ refreshToken: 'valid-token' });
      const result = await service.validateSession(req);

      expect(result.isValid).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.session!.user.id).toBe('user-1');
      expect(result.session!.user.email).toBe('test@example.com');
    });

    it('should return isValid false when no session exists', async () => {
      const auth = createAuthMock(null);
      const service = new AuthenticationService(auth as never, cryptoService);

      const req = createMockRequest({});
      const result = await service.validateSession(req);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('No valid session found');
      expect(result.session).toBeUndefined();
    });

    it('should return isValid false when getSession throws', async () => {
      const auth = createAuthMock();
      auth.api.getSession.mockRejectedValue(new Error('DB connection failed'));
      const service = new AuthenticationService(auth as never, cryptoService);

      const req = createMockRequest({});
      const result = await service.validateSession(req);

      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('accessTokenMiddleware', () => {
    it('should return JSON with accessToken for valid session', async () => {
      const sessionData = {
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
        session: { id: 's1', userId: 'user-1', token: 'tok', expiresAt: new Date() },
      };
      const auth = createAuthMock(sessionData);
      cryptoService.encrypt.mockResolvedValue('encrypted-access-token');

      const service = new AuthenticationService(auth as never, cryptoService);
      const req = createMockRequest({ refreshToken: 'valid-token' });
      const { res } = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.accessTokenMiddleware(req, res, next);

      expect(res.json).toHaveBeenCalledWith({ accessToken: 'encrypted-access-token' });
    });

    it('should return 401 for invalid session', async () => {
      const auth = createAuthMock(null);
      const service = new AuthenticationService(auth as never, cryptoService);

      const req = createMockRequest({});
      const { res } = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.accessTokenMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('should return 401 when an exception occurs', async () => {
      const auth = createAuthMock();
      auth.api.getSession.mockRejectedValue(new Error('Unexpected error'));
      const service = new AuthenticationService(auth as never, cryptoService);

      const req = createMockRequest({});
      const { res } = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.accessTokenMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });
  });

  describe('signInMiddleware', () => {
    it('should redirect to / on successful login', async () => {
      const responseHeaders = new Headers();
      responseHeaders.set('set-cookie', 'refreshToken=abc');
      const okResponse = new globalThis.Response(JSON.stringify({}), {
        status: 200,
        headers: responseHeaders,
      });
      const auth = createAuthMock(null, okResponse);

      const service = new AuthenticationService(auth as never, cryptoService);
      const req = createMockRequest(
        {},
        { body: { email: 'test@example.com', password: 'pass123' } }
      );
      const { res } = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.signInMiddleware(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith('/');
    });

    it('should redirect back with error on failed login (401)', async () => {
      const failResponse = new globalThis.Response(JSON.stringify({ error: 'bad' }), {
        status: 401,
      });
      const auth = createAuthMock(null, failResponse);

      const service = new AuthenticationService(auth as never, cryptoService);
      const req = createMockRequest({}, { body: { email: 'test@example.com', password: 'wrong' } });
      const { res } = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.signInMiddleware(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('/auth/sign-in?error='));
      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('Invalid%20email%20or%20password')
      );
    });

    it('should redirect with generic error on non-401 failure', async () => {
      const failResponse = new globalThis.Response(JSON.stringify({}), { status: 500 });
      const auth = createAuthMock(null, failResponse);

      const service = new AuthenticationService(auth as never, cryptoService);
      const req = createMockRequest({}, { body: { email: 'test@example.com', password: 'pass' } });
      const { res } = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.signInMiddleware(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('Sign%20in%20failed'));
    });

    it('should return 400 when email is missing', async () => {
      const auth = createAuthMock();
      const service = new AuthenticationService(auth as never, cryptoService);

      const req = createMockRequest({}, { body: { password: 'pass123' } });
      const { res } = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.signInMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Email and password are required' });
    });

    it('should return 400 when password is missing', async () => {
      const auth = createAuthMock();
      const service = new AuthenticationService(auth as never, cryptoService);

      const req = createMockRequest({}, { body: { email: 'test@example.com' } });
      const { res } = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.signInMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Email and password are required' });
    });

    it('should return 400 when both email and password are missing', async () => {
      const auth = createAuthMock();
      const service = new AuthenticationService(auth as never, cryptoService);

      const req = createMockRequest({}, { body: {} });
      const { res } = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.signInMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should redirect with error when handler throws', async () => {
      const auth = createAuthMock();
      auth.handler.mockRejectedValue(new Error('Network failure'));

      const service = new AuthenticationService(auth as never, cryptoService);
      const req = createMockRequest({}, { body: { email: 'test@example.com', password: 'pass' } });
      const { res } = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.signInMiddleware(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('/auth/sign-in?error='));
    });

    it('should forward response headers from auth handler on success', async () => {
      const responseHeaders = new Headers();
      responseHeaders.set('set-cookie', 'refreshToken=abc123; Path=/');
      responseHeaders.set('x-custom', 'header-value');
      const okResponse = new globalThis.Response(JSON.stringify({}), {
        status: 200,
        headers: responseHeaders,
      });
      const auth = createAuthMock(null, okResponse);

      const service = new AuthenticationService(auth as never, cryptoService);
      const req = createMockRequest(
        {},
        { body: { email: 'test@example.com', password: 'pass123' } }
      );
      const { res } = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.signInMiddleware(req, res, next);

      expect(res.set).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/');
    });
  });

  describe('signOutMiddleware', () => {
    it('should clear cookies and redirect to sign-in', async () => {
      const auth = createAuthMock();
      const service = new AuthenticationService(auth as never, cryptoService);

      const req = createMockRequest({ refreshToken: 'some-token' }, { query: {} });
      const { res } = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.signOutMiddleware(req, res, next);

      expect(auth.api.signOut).toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
      expect(res.clearCookie).toHaveBeenCalledWith('better-auth.csrf_token');
      expect(res.redirect).toHaveBeenCalledWith('/auth/sign-in');
    });

    it('should use redirect query param when provided', async () => {
      const auth = createAuthMock();
      const service = new AuthenticationService(auth as never, cryptoService);

      const req = createMockRequest(
        { refreshToken: 'some-token' },
        { query: { redirect: '/dashboard' } }
      );
      const { res } = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.signOutMiddleware(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith('/dashboard');
    });

    it('should return 500 when signOut fails', async () => {
      const auth = createAuthMock();
      auth.api.signOut.mockRejectedValue(new Error('signOut failed'));

      const service = new AuthenticationService(auth as never, cryptoService);
      const req = createMockRequest({ refreshToken: 'some-token' }, { query: {} });
      const { res } = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.signOutMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Sign-out failed' });
    });
  });

  describe('getSession', () => {
    it('should return session data when session exists', async () => {
      const expiresAt = new Date('2026-12-31T00:00:00Z');
      const sessionData = {
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
        session: { id: 's1', userId: 'user-1', token: 'tok', expiresAt },
      };
      const auth = createAuthMock(sessionData);
      const service = new AuthenticationService(auth as never, cryptoService);

      const req = createMockRequest({ refreshToken: 'valid-token' });
      const result = await service.getSession(req);

      expect(result).toEqual({
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
        session: { id: 's1', userId: 'user-1', token: 'tok', expiresAt },
      });
    });

    it('should return null when no session exists', async () => {
      const auth = createAuthMock(null);
      const service = new AuthenticationService(auth as never, cryptoService);

      const req = createMockRequest({});
      const result = await service.getSession(req);

      expect(result).toBeNull();
    });

    it('should throw when auth.api.getSession throws', async () => {
      const auth = createAuthMock();
      auth.api.getSession.mockRejectedValue(new Error('DB error'));
      const service = new AuthenticationService(auth as never, cryptoService);

      const req = createMockRequest({});

      await expect(service.getSession(req)).rejects.toThrow('Failed to get session');
    });
  });

  describe('signOut', () => {
    it('should call auth.api.signOut with request headers', async () => {
      const auth = createAuthMock();
      const service = new AuthenticationService(auth as never, cryptoService);

      const req = createMockRequest({ refreshToken: 'some-token' });
      await service.signOut(req);

      expect(auth.api.signOut).toHaveBeenCalledWith({
        headers: req.headers,
      });
    });

    it('should throw when signOut fails', async () => {
      const auth = createAuthMock();
      auth.api.signOut.mockRejectedValue(new Error('DB error'));
      const service = new AuthenticationService(auth as never, cryptoService);

      const req = createMockRequest({});

      await expect(service.signOut(req)).rejects.toThrow('Sign-out failed');
    });
  });

  describe('signIn', () => {
    it('should call auth.handler with correct URL and body', async () => {
      const auth = createAuthMock();
      const service = new AuthenticationService(auth as never, cryptoService);

      await service.signIn('test@example.com', 'password123', 'http', 'localhost:3000');

      expect(auth.handler).toHaveBeenCalled();
      const request = auth.handler.mock.calls[0]![0] as globalThis.Request;
      expect(request.url).toBe('http://localhost:3000/auth/better-auth/sign-in/email');
      expect(request.method).toBe('POST');
    });

    it('should throw when auth.handler fails', async () => {
      const auth = createAuthMock();
      auth.handler.mockRejectedValue(new Error('Network error'));
      const service = new AuthenticationService(auth as never, cryptoService);

      await expect(
        service.signIn('test@example.com', 'pass', 'http', 'localhost:3000')
      ).rejects.toThrow('Sign-in failed');
    });
  });

  describe('requireAuthMiddleware', () => {
    it('should call next when user is admin', async () => {
      const sessionData = {
        user: { id: 'user-1', email: 'admin@example.com', name: 'Admin' },
        session: { id: 's1', userId: 'user-1', token: 'tok', expiresAt: new Date() },
      };
      const auth = createAuthMock(sessionData);
      const service = new AuthenticationService(auth as never, cryptoService);
      (userManagementServiceMock.getUserRole as jest.Mock).mockResolvedValue('admin');
      service.setUserManagementService(userManagementServiceMock as never);

      const req = createMockRequest({ refreshToken: 'token' });
      const { res } = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.requireAuthMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should return 403 when user role is not admin', async () => {
      const sessionData = {
        user: { id: 'user-1', email: 'user@example.com', name: 'User' },
        session: { id: 's1', userId: 'user-1', token: 'tok', expiresAt: new Date() },
      };
      const auth = createAuthMock(sessionData);
      const service = new AuthenticationService(auth as never, cryptoService);
      (userManagementServiceMock.getUserRole as jest.Mock).mockResolvedValue('viewer');
      service.setUserManagementService(userManagementServiceMock as never);

      const req = createMockRequest({ refreshToken: 'token' });
      const { res } = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.requireAuthMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should redirect to sign-in when no session', async () => {
      const auth = createAuthMock(null);
      const service = new AuthenticationService(auth as never, cryptoService);

      const req = createMockRequest({}, { originalUrl: '/auth/dashboard' });
      const { res } = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.requireAuthMiddleware(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('/auth/sign-in?redirect='));
      expect(next).not.toHaveBeenCalled();
    });

    it('should redirect to sign-in when getSession throws', async () => {
      const auth = createAuthMock();
      auth.api.getSession.mockRejectedValue(new Error('DB error'));
      const service = new AuthenticationService(auth as never, cryptoService);

      const req = createMockRequest({});
      const { res } = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.requireAuthMiddleware(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith('/auth/sign-in');
    });
  });

  describe('generateAccessToken edge cases', () => {
    it('should always set projectId to 0', async () => {
      const sessionData = {
        user: { id: 'user-1', email: 'test@example.com', name: 'Test' },
        session: { id: 's1', userId: 'user-1', token: 'tok', expiresAt: new Date() },
      };
      const auth = createAuthMock(sessionData);
      (userManagementServiceMock.getUserRole as jest.Mock).mockResolvedValue('admin');
      cryptoService.encrypt.mockResolvedValue('enc');

      const service = new AuthenticationService(auth as never, cryptoService);
      service.setUserManagementService(userManagementServiceMock as never);

      const req = createMockRequest({ refreshToken: 'token' });
      await service.generateAccessToken(req);

      const parsed = JSON.parse((cryptoService.encrypt.mock.calls[0] as [string])[0]);
      expect(parsed.projectId).toBe('0');
    });

    it('should throw when encrypt fails', async () => {
      const sessionData = {
        user: { id: 'user-1', email: 'test@example.com', name: 'Test' },
        session: { id: 's1', userId: 'user-1', token: 'tok', expiresAt: new Date() },
      };
      const auth = createAuthMock(sessionData);
      cryptoService.encrypt.mockRejectedValue(new Error('Encryption failed'));

      const service = new AuthenticationService(auth as never, cryptoService);

      const req = createMockRequest({ refreshToken: 'token' });

      await expect(service.generateAccessToken(req)).rejects.toThrow(
        'Failed to generate access token'
      );
    });

    it('should throw when getUserRole fails', async () => {
      const sessionData = {
        user: { id: 'user-1', email: 'test@example.com', name: 'Test' },
        session: { id: 's1', userId: 'user-1', token: 'tok', expiresAt: new Date() },
      };
      const auth = createAuthMock(sessionData);
      (userManagementServiceMock.getUserRole as jest.Mock).mockRejectedValue(new Error('DB error'));

      const service = new AuthenticationService(auth as never, cryptoService);
      service.setUserManagementService(userManagementServiceMock as never);

      const req = createMockRequest({ refreshToken: 'token' });

      await expect(service.generateAccessToken(req)).rejects.toThrow(
        'Failed to generate access token'
      );
    });

    it('should include all expected fields in encrypted payload', async () => {
      const sessionData = {
        user: { id: 'uid-42', email: 'full@test.com', name: 'Full Name' },
        session: { id: 's1', userId: 'uid-42', token: 'tok', expiresAt: new Date() },
      };
      const auth = createAuthMock(sessionData);
      (userManagementServiceMock.getUserRole as jest.Mock).mockResolvedValue('editor');
      cryptoService.encrypt.mockResolvedValue('enc');

      const service = new AuthenticationService(auth as never, cryptoService);
      service.setUserManagementService(userManagementServiceMock as never);

      const req = createMockRequest({ refreshToken: 'token' });
      await service.generateAccessToken(req);

      const parsed = JSON.parse((cryptoService.encrypt.mock.calls[0] as [string])[0]);
      expect(parsed).toEqual({
        userId: 'uid-42',
        projectId: '0',
        email: 'full@test.com',
        fullName: 'Full Name',
        roles: ['editor'],
      });
    });
  });

  describe('accessTokenMiddleware edge cases', () => {
    it('should not call next function', async () => {
      const sessionData = {
        user: { id: 'user-1', email: 'test@example.com', name: 'Test' },
        session: { id: 's1', userId: 'user-1', token: 'tok', expiresAt: new Date() },
      };
      const auth = createAuthMock(sessionData);
      cryptoService.encrypt.mockResolvedValue('enc');

      const service = new AuthenticationService(auth as never, cryptoService);
      const req = createMockRequest({ refreshToken: 'valid' });
      const { res } = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.accessTokenMiddleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('signOutMiddleware edge cases', () => {
    it('should always clear both refreshToken and csrf_token cookies', async () => {
      const auth = createAuthMock();
      const service = new AuthenticationService(auth as never, cryptoService);

      const req = createMockRequest({}, { query: {} });
      const { res } = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.signOutMiddleware(req, res, next);

      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
      expect(res.clearCookie).toHaveBeenCalledWith('better-auth.csrf_token');
    });

    it('should default to /auth/sign-in when redirect query param is empty string', async () => {
      const auth = createAuthMock();
      const service = new AuthenticationService(auth as never, cryptoService);

      const req = createMockRequest({}, { query: { redirect: '' } });
      const { res } = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.signOutMiddleware(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith('/auth/sign-in');
    });
  });
});
