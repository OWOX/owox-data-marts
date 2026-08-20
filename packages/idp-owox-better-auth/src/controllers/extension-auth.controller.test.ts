import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Express, Request, Response } from 'express';
import { IdpFailedException } from '../core/exceptions.js';
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
      refreshProjectToken: jest.fn(),
      revokeProjectToken: jest.fn(),
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

  it('returns the standard project-token result for a Microsoft assertion', async () => {
    const req = {
      body: {
        assertion_type: 'ms_entra_access_token',
        assertion: 'signed-assertion',
        project_id: 'project-1',
      },
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

  it('refreshes the same project-scoped extension token type', async () => {
    const req = {
      body: { refresh_token: 'refresh-token' },
      path: '/auth/api/extension',
    } as Request;
    const res = response();
    service.refreshProjectToken.mockResolvedValue(auth);

    await controller.authenticate(req, res);

    expect(service.refreshProjectToken).toHaveBeenCalledWith('refresh-token');
    expect(res.json).toHaveBeenCalledWith(auth);
  });

  it('returns unknown_identity when the assertion lacks a safely verified email', async () => {
    const req = {
      body: { assertion_type: 'ms_entra_access_token', assertion: 'signed-assertion' },
      path: '/auth/api/extension',
    } as Request;
    const res = response();
    service.exchangeMicrosoftAssertion.mockResolvedValue({ status: 'unknown_identity' });

    await controller.authenticate(req, res);

    expect(res.json).toHaveBeenCalledWith({ status: 'unknown_identity' });
  });

  it('does not return 204 when token revocation fails', async () => {
    const req = {
      body: { refresh_token: 'refresh-token' },
      path: '/auth/api/extension/revoke',
    } as Request;
    const res = response();
    const error = new IdpFailedException('Failed to revoke extension project token');
    const loggerError = jest.fn();
    (
      controller as unknown as {
        logger: { error: typeof loggerError };
      }
    ).logger.error = loggerError;
    service.revokeProjectToken.mockRejectedValue(error);

    await controller.revoke(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    expect(res.status).not.toHaveBeenCalledWith(204);
    expect(loggerError).toHaveBeenCalledWith(
      'Extension authentication failed: IdpFailedException',
      { path: '/auth/api/extension/revoke', status: 500 },
      error
    );
  });

  it('registers only exchange, refresh and revoke routes', () => {
    const app = {
      options: jest.fn(),
      post: jest.fn(),
      get: jest.fn(),
    } as unknown as Express;

    controller.registerRoutes(app);

    expect(app.post).toHaveBeenCalledTimes(2);
    expect(app.post).toHaveBeenCalledWith(
      '/auth/api/extension',
      expect.any(Function),
      expect.any(Function),
      expect.any(Function)
    );
    expect(app.post).toHaveBeenCalledWith(
      '/auth/api/extension/revoke',
      expect.any(Function),
      expect.any(Function),
      expect.any(Function)
    );
    expect(app.get).not.toHaveBeenCalled();
  });

  it('rejects a browser origin outside the exact allowlist', () => {
    const app = { options: jest.fn(), post: jest.fn() } as unknown as Express;
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
