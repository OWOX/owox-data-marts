import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import type { AuthenticationService } from './authentication-service.js';
import type { PageService } from './page-service.js';
import type { UserManagementService } from './user-management-service.js';

const { MiddlewareService } = await import('./middleware-service.js');

function createAuthServiceMock(): jest.Mocked<AuthenticationService> {
  return {
    getSession: jest.fn(),
    signInMiddleware: jest.fn(),
    signOutMiddleware: jest.fn(),
    accessTokenMiddleware: jest.fn(),
    validateSession: jest.fn(),
    generateAccessToken: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
    setUserManagementService: jest.fn(),
    setPassword: jest.fn(),
    requireAuthMiddleware: jest.fn(),
  } as unknown as jest.Mocked<AuthenticationService>;
}

function createPageServiceMock(): jest.Mocked<PageService> {
  return {
    signInPage: jest.fn(),
    registerRoutes: jest.fn(),
  } as unknown as jest.Mocked<PageService>;
}

function createUserManagementServiceMock(): jest.Mocked<UserManagementService> {
  return {
    getUserRole: jest.fn(),
  } as unknown as jest.Mocked<UserManagementService>;
}

function createMockRequest(): Request {
  return {
    headers: {},
    cookies: {},
    body: {},
    query: {},
  } as unknown as Request;
}

function createMockResponse(): Response {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    redirect: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe('MiddlewareService', () => {
  let authService: jest.Mocked<AuthenticationService>;
  let pageService: jest.Mocked<PageService>;
  let userManagementService: jest.Mocked<UserManagementService>;
  let service: InstanceType<typeof MiddlewareService>;

  beforeEach(() => {
    authService = createAuthServiceMock();
    pageService = createPageServiceMock();
    userManagementService = createUserManagementServiceMock();
    service = new MiddlewareService(authService, pageService, userManagementService);
    jest.clearAllMocks();
  });

  describe('signInMiddleware', () => {
    it('should delegate to pageService.signInPage', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.signInMiddleware(req, res, next);

      expect(pageService.signInPage).toHaveBeenCalledWith(req, res);
    });
  });

  describe('signOutMiddleware', () => {
    it('should delegate to authenticationService.signOutMiddleware', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.signOutMiddleware(req, res, next);

      expect(authService.signOutMiddleware).toHaveBeenCalledWith(req, res, next);
    });
  });

  describe('accessTokenMiddleware', () => {
    it('should delegate to authenticationService.accessTokenMiddleware', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.accessTokenMiddleware(req, res, next);

      expect(authService.accessTokenMiddleware).toHaveBeenCalledWith(req, res, next);
    });
  });

  describe('userApiMiddleware', () => {
    it('should return user payload when session is valid and user has role', async () => {
      authService.validateSession.mockResolvedValue({
        isValid: true,
        session: {
          user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
          session: { id: 's1', userId: 'user-1', token: 'tok', expiresAt: new Date() },
        },
      });
      (userManagementService.getUserRole as jest.Mock).mockResolvedValue('admin');

      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.userApiMiddleware(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        userId: 'user-1',
        projectId: '0',
        email: 'test@example.com',
        fullName: 'Test User',
        roles: ['admin'],
      });
    });

    it('should return 401 when session is invalid', async () => {
      authService.validateSession.mockResolvedValue({
        isValid: false,
        error: 'No session',
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.userApiMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('should return 403 when user has no role', async () => {
      authService.validateSession.mockResolvedValue({
        isValid: true,
        session: {
          user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
          session: { id: 's1', userId: 'user-1', token: 'tok', expiresAt: new Date() },
        },
      });
      (userManagementService.getUserRole as jest.Mock).mockResolvedValue(null);

      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.userApiMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
    });

    it('should return 401 when validateSession throws', async () => {
      authService.validateSession.mockRejectedValue(new Error('DB error'));

      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.userApiMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should use email as fullName when name is missing', async () => {
      authService.validateSession.mockResolvedValue({
        isValid: true,
        session: {
          user: { id: 'user-1', email: 'test@example.com', name: '' },
          session: { id: 's1', userId: 'user-1', token: 'tok', expiresAt: new Date() },
        },
      });
      (userManagementService.getUserRole as jest.Mock).mockResolvedValue('viewer');

      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.userApiMiddleware(req, res, next);

      const payload = (res.json as jest.Mock).mock.calls[0]![0] as Record<string, unknown>;
      expect(payload.fullName).toBe('test@example.com');
    });

    it('should always set projectId to 0', async () => {
      authService.validateSession.mockResolvedValue({
        isValid: true,
        session: {
          user: { id: 'user-1', email: 'a@b.com', name: 'A' },
          session: { id: 's1', userId: 'user-1', token: 'tok', expiresAt: new Date() },
        },
      });
      (userManagementService.getUserRole as jest.Mock).mockResolvedValue('editor');

      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn<NextFunction>();

      await service.userApiMiddleware(req, res, next);

      const payload = (res.json as jest.Mock).mock.calls[0]![0] as Record<string, unknown>;
      expect(payload.projectId).toBe('0');
    });
  });
});
