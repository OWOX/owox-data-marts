import { describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { OwoxBetterAuthIdp } from './owox-better-auth-idp.js';

function createResponse(): Response {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    redirect: jest.fn(),
  } as unknown as Response;
}

function createProvider(overrides: Record<string, unknown> = {}): OwoxBetterAuthIdp {
  return Object.assign(Object.create(OwoxBetterAuthIdp.prototype), {
    pageController: {
      signInPage: jest.fn().mockResolvedValue(undefined),
      signUpPage: jest.fn().mockResolvedValue(undefined),
    },
    config: {
      idpOwox: {
        idpConfig: {
          platformSignInUrl: 'https://platform.test/auth/sign-in',
          platformSignUpUrl: 'https://platform.test/auth/sign-up',
          allowedRedirectOrigins: [],
        },
      },
    },
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    ...overrides,
  }) as OwoxBetterAuthIdp;
}

describe('OwoxBetterAuthIdp - deferred PKCE state until sign-in intent', () => {
  describe('signInMiddleware / handleNoState', () => {
    it('renders the sign-in page locally without starting a Platform PKCE round trip on a plain, unauthenticated page load', async () => {
      const provider = createProvider();
      const request = {
        headers: { cookie: '' },
        query: {},
      } as unknown as Request;
      const response = createResponse();

      await provider.signInMiddleware(request, response, jest.fn());

      expect(provider['pageController'].signInPage).toHaveBeenCalledWith(request, response);
      expect(response.redirect).not.toHaveBeenCalled();
    });

    it('starts the Platform PKCE round trip when the request carries an explicit pendingAction', async () => {
      const provider = createProvider();
      const request = {
        headers: { cookie: '' },
        query: { pendingAction: 'google' },
      } as unknown as Request;
      const response = createResponse();

      await provider.signInMiddleware(request, response, jest.fn());

      expect(provider['pageController'].signInPage).not.toHaveBeenCalled();
      expect(response.redirect).toHaveBeenCalledWith(
        expect.stringContaining('https://platform.test/auth/sign-in')
      );
      // pendingAction must survive into the persisted params cookie so it can
      // be resumed once state comes back from Platform.
      expect(response.cookie).toHaveBeenCalledWith(
        'idp-owox-params',
        expect.stringContaining('pendingAction'),
        expect.anything()
      );
    });

    it('rejects an unrecognized pendingAction value and falls back to the local sign-in page', async () => {
      const provider = createProvider();
      const request = {
        headers: { cookie: '' },
        query: { pendingAction: 'not-a-real-action' },
      } as unknown as Request;
      const response = createResponse();

      await provider.signInMiddleware(request, response, jest.fn());

      expect(provider['pageController'].signInPage).toHaveBeenCalledWith(request, response);
      expect(response.redirect).not.toHaveBeenCalled();
    });

    it('still bounces to Platform for an existing fast-path (project + refresh token) without requiring pendingAction', async () => {
      const idpStartMiddleware = jest.fn().mockResolvedValue(undefined);
      const provider = createProvider({
        authFlowMiddleware: { idpStartMiddleware },
      });
      const request = {
        headers: { cookie: 'refreshToken=refresh-token-1' },
        query: { projectId: 'project-1' },
      } as unknown as Request;
      const response = createResponse();

      await provider.signInMiddleware(request, response, jest.fn());

      expect(idpStartMiddleware).toHaveBeenCalledWith(request, response);
      expect(provider['pageController'].signInPage).not.toHaveBeenCalled();
    });
  });

  describe('signUpMiddleware', () => {
    it('renders the sign-up page locally without starting a Platform PKCE round trip on a plain, unauthenticated page load', async () => {
      const provider = createProvider();
      const request = {
        headers: { cookie: '' },
        query: {},
      } as unknown as Request;
      const response = createResponse();

      await provider.signUpMiddleware(request, response, jest.fn());

      expect(provider['pageController'].signUpPage).toHaveBeenCalledWith(request, response);
      expect(response.redirect).not.toHaveBeenCalled();
    });

    it('starts the Platform PKCE round trip when the request carries an explicit pendingAction', async () => {
      const provider = createProvider();
      const request = {
        headers: { cookie: '' },
        query: { pendingAction: 'microsoft' },
      } as unknown as Request;
      const response = createResponse();

      await provider.signUpMiddleware(request, response, jest.fn());

      expect(provider['pageController'].signUpPage).not.toHaveBeenCalled();
      expect(response.redirect).toHaveBeenCalledWith(
        expect.stringContaining('https://platform.test/auth/sign-up')
      );
    });

    it('still bounces to Platform when a refresh token establishes an existing session, even without pendingAction', async () => {
      const provider = createProvider();
      const request = {
        headers: { cookie: 'refreshToken=refresh-token-1' },
        query: {},
      } as unknown as Request;
      const response = createResponse();

      await provider.signUpMiddleware(request, response, jest.fn());

      expect(provider['pageController'].signUpPage).not.toHaveBeenCalled();
      expect(response.redirect).toHaveBeenCalledWith(
        expect.stringContaining('https://platform.test/auth/sign-up')
      );
    });
  });
});
