import { describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { AuthFlowMiddleware } from './auth-flow-middleware.js';

describe('AuthFlowMiddleware', () => {
  it('renders the social choice before reusing an existing refresh token on the Platform return', async () => {
    const signInPage = jest.fn().mockResolvedValue(undefined);
    const completeWithIdentityRefreshToken = jest.fn();
    const middleware = new AuthFlowMiddleware(
      { signInPage } as never,
      { completeWithIdentityRefreshToken } as never
    );
    const request = {
      query: { state: 'fresh-state' },
      headers: {
        cookie:
          'idp-owox-state=fresh-state; refreshToken=existing; idp-owox-verified-social-intent=google',
      },
    } as unknown as Request;
    const response = { redirect: jest.fn() } as unknown as Response;

    await middleware.signInMiddleware(request, response, jest.fn());

    expect(completeWithIdentityRefreshToken).not.toHaveBeenCalled();
    expect(signInPage).toHaveBeenCalledWith(request, response);
  });
});
