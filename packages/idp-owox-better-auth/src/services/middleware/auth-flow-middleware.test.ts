import { describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { AuthFlowMiddleware } from './auth-flow-middleware.js';

describe('AuthFlowMiddleware', () => {
  it('persists platform continuation before redirecting to IDP flow', async () => {
    const store = {
      initialize: jest.fn().mockResolvedValue(undefined),
      saveAuthState: jest.fn().mockResolvedValue(undefined),
    };
    const middleware = new AuthFlowMiddleware(
      {} as never,
      {
        idpConfig: {
          platformSignInUrl: 'https://platform.test/auth/sign-in',
          allowedRedirectOrigins: ['https://platform.test'],
          clientId: 'app-owox',
        },
      } as never,
      store as never,
      {} as never
    );
    const redirectTo =
      '/oauth/authorize?response_type=code&client_id=mcp-client&state=client-state';
    const request = {
      path: '/auth/sign-in',
      protocol: 'https',
      hostname: 'float-device-amiss.ngrok-free.dev',
      headers: { cookie: '' },
      query: {
        redirect: redirectTo,
      },
    } as unknown as Request;
    const response = {
      cookie: jest.fn(),
      redirect: jest.fn(),
      status: jest.fn().mockReturnThis(),
      end: jest.fn(),
    } as unknown as Response;

    await middleware.idpStartMiddleware(request, response);

    expect(store.saveAuthState).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(Date),
      expect.objectContaining({
        redirectTo,
      })
    );
    expect(response.cookie).toHaveBeenCalledWith(
      'idp-owox-params',
      expect.stringContaining(encodeURIComponent('/oauth/authorize')),
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
      })
    );
    expect(response.redirect).toHaveBeenCalledWith(
      expect.stringContaining('https://platform.test/auth/sign-in')
    );
  });
});
