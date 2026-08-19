import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Express, Request, Response } from 'express';
import type { ExtensionAuthService } from '../services/auth/extension-auth-service.js';
import { ExtensionAuthController } from './extension-auth.controller.js';

const auth = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  accessTokenExpiresIn: 900,
  refreshTokenExpiresIn: 3600,
};

describe('ExtensionAuthController', () => {
  let service: jest.Mocked<ExtensionAuthService>;
  let controller: ExtensionAuthController;

  beforeEach(() => {
    service = {
      exchangeMicrosoftAssertion: jest.fn(),
      refreshIdentitySession: jest.fn(),
      listProjects: jest.fn(),
      exchangeProjectToken: jest.fn(),
      refreshProjectToken: jest.fn(),
      revoke: jest.fn(),
    } as unknown as jest.Mocked<ExtensionAuthService>;
    controller = new ExtensionAuthController(service, {
      allowedOrigins: ['https://addin.owox.test'],
    });
  });

  function response(): Response {
    return {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      vary: jest.fn(),
    } as unknown as Response;
  }

  it('returns the familiar AuthResult shape for a Microsoft assertion', async () => {
    const req = {
      body: {
        assertion_type: 'ms_entra_access_token',
        assertion: 'signed-assertion',
        project_id: 'project-1',
      },
      ip: '127.0.0.1',
      socket: {},
      path: '/auth/api/extension',
    } as Request;
    const res = response();
    service.exchangeMicrosoftAssertion.mockResolvedValue({ status: 'authenticated', auth });

    await controller.authenticate(req, res);

    expect(service.exchangeMicrosoftAssertion).toHaveBeenCalledWith(
      'signed-assertion',
      'project-1'
    );
    expect(res.json).toHaveBeenCalledWith(auth);
  });

  it('returns unknown_identity as a typed recoverable result', async () => {
    const req = {
      body: { assertion_type: 'ms_entra_access_token', assertion: 'signed-assertion' },
      ip: '127.0.0.1',
      socket: {},
      path: '/auth/api/extension',
    } as Request;
    const res = response();
    service.exchangeMicrosoftAssertion.mockResolvedValue({ status: 'unknown_identity' });

    await controller.authenticate(req, res);

    expect(res.json).toHaveBeenCalledWith({ status: 'unknown_identity' });
  });

  it('requires identity-session bearer auth when exchanging an explicit project', async () => {
    const req = {
      body: { project_id: 'project-1' },
      header: jest.fn().mockReturnValue(undefined),
      path: '/auth/api/extension/project-token',
    } as unknown as Request;
    const res = response();

    await controller.projectToken(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(service.exchangeProjectToken).not.toHaveBeenCalled();
  });

  it('rejects ambiguous project refresh auth modes', async () => {
    const req = {
      body: { refresh_token: 'project-refresh-token' },
      header: jest.fn().mockReturnValue('Bearer identity-access-token'),
      path: '/auth/api/extension/project-token',
    } as unknown as Request;
    const res = response();

    await controller.projectToken(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'ambiguous_auth_mode' });
  });

  it('registers only the new host-neutral routes', () => {
    const app = {
      options: jest.fn(),
      post: jest.fn(),
      get: jest.fn(),
    } as unknown as Express;

    controller.registerRoutes(app);

    expect(app.post).toHaveBeenCalledWith(
      '/auth/api/extension',
      expect.any(Function),
      expect.any(Function),
      expect.any(Function)
    );
    expect(app.get).toHaveBeenCalledWith(
      '/auth/api/extension/projects',
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('rejects a browser origin outside the exact allowlist', () => {
    const app = {
      options: jest.fn(),
      post: jest.fn(),
      get: jest.fn(),
    } as unknown as Express;
    controller.registerRoutes(app);
    const cors = (app.post as jest.Mock).mock.calls[0]![1] as (
      req: Request,
      res: Response,
      next: () => void
    ) => void;
    const req = {
      method: 'POST',
      header: jest.fn().mockReturnValue('https://attacker.example'),
    } as unknown as Request;
    const res = response();
    const next = jest.fn();

    cors(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
