import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { type Express, Request, Response } from 'express';
import { GoogleSheetsExtensionAuthController } from './google-sheets-auth.controller.js';
import { OwoxTokenFacade } from '../facades/owox-token-facade.js';
import {
  AuthenticationException,
  ForbiddenException,
  IdpFailedException,
} from '../core/exceptions.js';

describe('GoogleSheetsExtensionAuthController', () => {
  let controller: GoogleSheetsExtensionAuthController;
  let tokenFacade: jest.Mocked<OwoxTokenFacade>;

  beforeEach(() => {
    tokenFacade = {
      exchangeGoogleIdToken: jest.fn(),
      refreshToken: jest.fn(),
    } as unknown as jest.Mocked<OwoxTokenFacade>;
    controller = new GoogleSheetsExtensionAuthController(tokenFacade);
  });

  function createMockResponse() {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;
    return res;
  }

  describe('authenticate', () => {
    it('successfully authenticates via google_id_token', async () => {
      const req = {
        body: { google_id_token: 'valid_id_token', project_id: 'p1' },
      } as Request;
      const res = createMockResponse();
      const authResult = {
        accessToken: 'access',
        refreshToken: 'refresh',
        accessTokenExpiresIn: 3600,
        refreshTokenExpiresIn: 7200,
      };
      tokenFacade.exchangeGoogleIdToken.mockResolvedValue(authResult);

      await controller.authenticate(req, res);

      expect(tokenFacade.exchangeGoogleIdToken).toHaveBeenCalledWith('valid_id_token', 'p1');
      expect(res.json).toHaveBeenCalledWith(authResult);
    });

    it('successfully refreshes tokens', async () => {
      const req = {
        body: { refresh_token: 'valid_refresh_token' },
      } as Request;
      const res = createMockResponse();
      const authResult = {
        accessToken: 'access',
        refreshToken: 'refresh',
        accessTokenExpiresIn: 3600,
        refreshTokenExpiresIn: 7200,
      };
      tokenFacade.refreshToken.mockResolvedValue(authResult);

      await controller.authenticate(req, res);

      expect(tokenFacade.refreshToken).toHaveBeenCalledWith('valid_refresh_token');
      expect(res.json).toHaveBeenCalledWith(authResult);
    });

    it('returns 401 on AuthenticationException', async () => {
      const req = { body: { google_id_token: 'invalid' } } as Request;
      const res = createMockResponse();
      tokenFacade.exchangeGoogleIdToken.mockRejectedValue(
        new AuthenticationException('Invalid token')
      );

      await controller.authenticate(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    });

    it('returns 403 on ForbiddenException', async () => {
      const req = { body: { google_id_token: 'forbidden' } } as Request;
      const res = createMockResponse();
      tokenFacade.exchangeGoogleIdToken.mockRejectedValue(new ForbiddenException('Forbidden'));

      await controller.authenticate(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Access forbidden' });
    });

    it('returns status from IdpFailedException', async () => {
      const req = { body: { google_id_token: 'failed' } } as Request;
      const res = createMockResponse();
      tokenFacade.exchangeGoogleIdToken.mockRejectedValue(
        new IdpFailedException('IDP failed', { status: 502 })
      );

      await controller.authenticate(req, res);

      expect(res.status).toHaveBeenCalledWith(502);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });

    it('returns 500 on unknown error', async () => {
      const req = { body: { google_id_token: 'error' } } as Request;
      const res = createMockResponse();
      tokenFacade.exchangeGoogleIdToken.mockRejectedValue(new Error('Unknown error'));

      await controller.authenticate(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });

  describe('registerRoutes', () => {
    it('successfully registers routes', () => {
      const app = {
        post: jest.fn(),
      } as unknown as Express;

      controller.registerRoutes(app);

      expect(app.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/google-sheets-extension'),
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('logs error if registration fails', () => {
      const app = {
        post: jest.fn(() => {
          throw new Error('Registration failed');
        }),
      } as unknown as Express;
      const loggerSpy = jest.spyOn((controller as any).logger, 'error');

      controller.registerRoutes(app);

      expect(loggerSpy).toHaveBeenCalledWith(
        'Failed to register Google Sheets Extension auth routes',
        {},
        expect.any(Error)
      );
    });
  });
});
