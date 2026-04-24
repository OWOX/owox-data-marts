import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { type Express, Request, Response } from 'express';
import { GoogleSheetsExtensionAuthController } from './google-sheets-auth.controller.js';
import { OwoxTokenFacade } from '../facades/owox-token-facade.js';
import {
  AuthenticationException,
  ForbiddenException,
  IdentityApiException,
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
      expect(res.json).toHaveBeenCalledWith({ error: 'InvalidToken' });
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

    it('maps UnknownUser IDP error to stable error response', async () => {
      const req = { body: { google_id_token: 'unknown-user' } } as Request;
      const res = createMockResponse();
      tokenFacade.exchangeGoogleIdToken.mockRejectedValue(
        new IdentityApiException('IDP error', {
          context: {
            body: { status: 'UnknownUser', params: { googleAccountId: '118327446763797398368' } },
          },
        })
      );

      await controller.authenticate(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: 'UnknownUser',
        params: { googleAccountId: '118327446763797398368' },
      });
    });

    it('maps UnknownProject IDP error to stable error response', async () => {
      const req = { body: { google_id_token: 'unknown-project' } } as Request;
      const res = createMockResponse();
      tokenFacade.exchangeGoogleIdToken.mockRejectedValue(
        new IdentityApiException('IDP error', {
          context: { body: { status: 'UnknownProject', params: { projectName: 'My Project' } } },
        })
      );

      await controller.authenticate(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: 'UnknownProject',
        params: { projectName: 'My Project' },
      });
    });

    it('maps AuthenticationException with description to stable error response', async () => {
      const req = { body: { google_id_token: 'expired' } } as Request;
      const res = createMockResponse();
      tokenFacade.exchangeGoogleIdToken.mockRejectedValue(
        new AuthenticationException('Invalid or expired credentials', {
          description: 'Token has expired',
        })
      );

      await controller.authenticate(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'InvalidToken',
        description: 'Token has expired',
      });
    });

    it('returns generic error when IdpFailedException has no mapped client response (no leak)', async () => {
      const req = { body: { google_id_token: 'bad-gateway' } } as Request;
      const res = createMockResponse();
      tokenFacade.exchangeGoogleIdToken.mockRejectedValue(
        new IdpFailedException('Failed: 502', {
          status: 502,
          context: { responseData: { raw: 'internal' } },
        })
      );

      await controller.authenticate(req, res);

      expect(res.status).toHaveBeenCalledWith(502);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
      expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({ raw: 'internal' }));
    });

    it('maps all 400-specific IDP errors to stable error responses', async () => {
      const cases = [
        {
          rawBody: { status: 'invalidBody' },
        },
        {
          rawBody: { status: 'invalidSigninMethod' },
        },
        {
          rawBody: { status: 'locked' },
        },
        {
          rawBody: { status: 'erased' },
        },
        {
          rawBody: { status: 'CannotRetrieveProject' },
        },
        {
          rawBody: { status: 'AccessDeniedToProject', params: { projectName: 'My Project' } },
        },
      ] as const;

      for (const { rawBody } of cases) {
        const req = { body: { google_id_token: 'test' } } as Request;
        const res = createMockResponse();
        tokenFacade.exchangeGoogleIdToken.mockRejectedValue(
          new IdentityApiException('IDP error', { context: { body: rawBody } })
        );

        await controller.authenticate(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(rawBody);
      }
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

    it('throws if registration fails', () => {
      const app = {
        post: jest.fn(() => {
          throw new Error('Registration failed');
        }),
      } as unknown as Express;

      expect(() => controller.registerRoutes(app)).toThrow('Registration failed');
    });
  });
});
