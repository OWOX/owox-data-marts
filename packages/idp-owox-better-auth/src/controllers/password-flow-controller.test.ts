import { describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import type { createBetterAuthConfig } from '../config/idp-better-auth-config.js';
import type { BetterAuthSessionService } from '../services/auth/better-auth-session-service.js';
import type { MagicLinkService } from '../services/auth/magic-link-service.js';
import { PasswordFlowController } from './password-flow-controller.js';

type BetterAuthInstance = Awaited<ReturnType<typeof createBetterAuthConfig>>;

function createResponseMock(): Response & { body?: unknown; statusCode?: number } {
  const res = {} as Response & { body?: unknown; statusCode?: number };
  res.statusCode = 200;
  const statusMock = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.status = statusMock as unknown as Response['status'];
  const clearCookieMock = jest.fn(() => res);
  res.clearCookie = clearCookieMock as unknown as Response['clearCookie'];
  const sendMock = jest.fn((body: unknown) => {
    res.body = body;
    return res;
  });
  res.send = sendMock as unknown as Response['send'];
  const jsonMock = jest.fn((body: unknown) => {
    res.body = body;
    return res;
  });
  res.json = jsonMock as unknown as Response['json'];
  const redirectMock = jest.fn((url: string) => {
    res.body = { redirect: url };
    return res;
  });
  res.redirect = redirectMock as unknown as Response['redirect'];
  return res;
}

describe('PasswordFlowController.sendMagicLink', () => {
  it('returns 429 when magic link is rate limited', async () => {
    const magicLinkService = {
      generate: jest.fn(async () => ({ sent: false as const, reason: 'rate_limited' as const })),
    } as unknown as MagicLinkService;
    const auth = {} as BetterAuthInstance;
    const service = new PasswordFlowController(
      auth,
      {} as BetterAuthSessionService,
      magicLinkService
    );

    const req = { body: { email: 'user@example.com', intent: 'signup' } } as unknown as Request;
    const res = createResponseMock();

    await service.sendMagicLink(req, res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Please wait before requesting another email',
      waitSeconds: undefined,
    });
  });
});

describe('PasswordFlowController.passwordSetupPage', () => {
  it('renders reset form without requiring session when token is present', async () => {
    const getSession = jest.fn(async () => null);
    const auth = {
      api: {
        getSession,
      },
    } as unknown as BetterAuthInstance;
    const service = new PasswordFlowController(
      auth,
      {} as BetterAuthSessionService,
      {} as MagicLinkService
    );
    const req = {
      query: { token: 'reset-token', intent: 'reset' },
    } as unknown as Request;
    const res = createResponseMock();

    await service.passwordSetupPage(req, res);

    expect(getSession).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });
});

describe('PasswordFlowController.setPassword', () => {
  const baseHeaders = { cookie: 'session=token' };
  type ResetPasswordParams = { headers?: Headers; body?: unknown };

  it('uses resetPassword when intent is reset and token is provided', async () => {
    const resetPassword = jest.fn<(_params: ResetPasswordParams) => Promise<unknown>>(
      async () => ({})
    );
    const signOut = jest.fn(async () => ({}));
    const auth = {
      api: {
        getSession: jest.fn(async () => ({
          user: { id: 'user-id', email: 'user@example.com' },
        })),
        resetPassword,
        setPassword: jest.fn(),
        signOut,
      },
    } as unknown as BetterAuthInstance;
    const service = new PasswordFlowController(
      auth,
      {} as BetterAuthSessionService,
      {} as MagicLinkService
    );
    const req = {
      body: { password: 'NewPassw0rd', intent: 'reset', token: 'reset-token' },
      headers: baseHeaders,
    } as unknown as Request;
    const res = createResponseMock();

    await service.setPassword(req, res);

    expect(resetPassword).toHaveBeenCalledWith({
      body: { newPassword: 'NewPassw0rd', token: 'reset-token' },
      headers: expect.any(Headers),
    });
    const resetHeaders = resetPassword.mock.calls[0]?.[0]?.headers;
    expect(resetHeaders?.get('cookie')).toBe('session=token');
    expect(signOut).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/auth/password/success');
  });

  it('uses resetPassword when token is provided even without intent', async () => {
    const resetPassword = jest.fn<(_params: ResetPasswordParams) => Promise<unknown>>(
      async () => ({})
    );
    const auth = {
      api: {
        getSession: jest.fn(async () => ({
          user: { id: 'user-id', email: 'user@example.com' },
        })),
        resetPassword,
        setPassword: jest.fn(),
        signOut: jest.fn(async () => ({})),
      },
    } as unknown as BetterAuthInstance;
    const service = new PasswordFlowController(
      auth,
      {} as BetterAuthSessionService,
      {} as MagicLinkService
    );
    const req = {
      body: { password: 'NewPassw0rd', token: 'reset-token' },
      headers: baseHeaders,
    } as unknown as Request;
    const res = createResponseMock();

    await service.setPassword(req, res);

    expect(resetPassword).toHaveBeenCalledWith({
      body: { newPassword: 'NewPassw0rd', token: 'reset-token' },
      headers: expect.any(Headers),
    });
    const resetHeaders = resetPassword.mock.calls[0]?.[0]?.headers;
    expect(resetHeaders?.get('cookie')).toBe('session=token');
    expect(auth.api.signOut).not.toHaveBeenCalled();
  });

  it('returns 400 when reset intent is missing token', async () => {
    const auth = {
      api: {
        getSession: jest.fn(async () => ({
          user: { id: 'user-id', email: 'user@example.com' },
        })),
        resetPassword: jest.fn(),
        setPassword: jest.fn(),
        signOut: jest.fn(),
      },
    } as unknown as BetterAuthInstance;
    const service = new PasswordFlowController(
      auth,
      {} as BetterAuthSessionService,
      {} as MagicLinkService
    );
    const req = {
      body: { password: 'NewPassw0rd', intent: 'reset' },
      headers: baseHeaders,
    } as unknown as Request;
    const res = createResponseMock();

    await service.setPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Reset link is invalid or has expired.',
    });
    expect(auth.api.resetPassword).not.toHaveBeenCalled();
  });
});
