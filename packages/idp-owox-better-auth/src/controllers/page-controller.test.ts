import { describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { PageController } from './page-controller.js';

function createResponse(): Response & { body?: string } {
  const res = {} as Response & { body?: string };
  res.send = jest.fn((body: unknown) => {
    res.body = String(body);
    return res;
  }) as unknown as Response['send'];
  res.setHeader = jest.fn(() => res) as unknown as Response['setHeader'];
  res.cookie = jest.fn(() => res) as unknown as Response['cookie'];
  res.clearCookie = jest.fn(() => res) as unknown as Response['clearCookie'];
  return res;
}

function createRequest(query: Record<string, string>, cookie = ''): Request {
  return {
    query,
    protocol: 'https',
    hostname: 'app.test',
    headers: { cookie },
  } as unknown as Request;
}

function paramsCookieHeader(params: Record<string, unknown>): string {
  return `idp-owox-params=${encodeURIComponent(JSON.stringify(params))}`;
}

function socialIntentCookieHeader(provider: string): string {
  return `idp-owox-verified-social-intent=${provider}`;
}

function lastParamsCookieValue(res: Response): Record<string, unknown> | undefined {
  const calls = (res.cookie as jest.Mock).mock.calls.filter(call => call[0] === 'idp-owox-params');
  if (calls.length === 0) return undefined;
  const raw = calls[calls.length - 1][1] as string;
  return JSON.parse(decodeURIComponent(raw));
}

describe('PageController.signInPage / signUpPage', () => {
  const providers = { google: true, microsoft: true, email: true };

  it('renders with hasState=false and no auto-submit on a plain, state-less page load', async () => {
    const controller = new PageController(providers);
    const req = createRequest({});
    const res = createResponse();

    await controller.signInPage(req, res);

    expect(res.body).toContain('const hasAuthState = false;');
    expect(res.body).toContain('const autoSubmitProvider = null;');
    expect(res.body).toContain('requestSocialIntentNonce()');
    expect(res.cookie).not.toHaveBeenCalledWith(
      'idp-owox-social-intent',
      expect.anything(),
      expect.anything()
    );
  });

  it('shows a saved error once after the new state returns', async () => {
    const controller = new PageController(providers);
    const req = createRequest(
      { state: 'fresh-state' },
      `idp-owox-auth-error=${encodeURIComponent('Your sign-in session expired. Please try again.')}`
    );
    const res = createResponse();

    await controller.signInPage(req, res);

    expect(res.body).toContain('Your sign-in session expired. Please try again.');
    expect(res.clearCookie).toHaveBeenCalledWith(
      'idp-owox-auth-error',
      expect.objectContaining({ path: '/' })
    );
  });

  it('auto-submits the verified Google action once state has come back, and consumes the short-lived cookie', async () => {
    const controller = new PageController(providers);
    const req = createRequest(
      { state: 'fresh-state' },
      `${socialIntentCookieHeader('google')}; ${paramsCookieHeader({ redirectTo: '/dashboard' })}`
    );
    const res = createResponse();

    await controller.signInPage(req, res);

    expect(res.body).toContain('const hasAuthState = true;');
    expect(res.body).toContain('const autoSubmitProvider = "google";');

    const persisted = lastParamsCookieValue(res);
    expect(persisted?.redirectTo).toBe('/dashboard');
    expect(res.clearCookie).toHaveBeenCalledWith(
      'idp-owox-verified-social-intent',
      expect.objectContaining({ path: '/' })
    );
  });

  it('does not auto-submit for a pending email action - the user must submit the form themselves', async () => {
    const controller = new PageController(providers);
    const req = createRequest(
      { state: 'fresh-state' },
      paramsCookieHeader({ pendingAction: 'email' })
    );
    const res = createResponse();

    await controller.signInPage(req, res);

    expect(res.body).toContain('const hasAuthState = true;');
    expect(res.body).toContain('const autoSubmitProvider = null;');
  });

  it('never auto-submits when there is no query state, even with a verified action cookie', async () => {
    const controller = new PageController(providers);
    const req = createRequest(
      {},
      `idp-owox-state=stale-state; ${socialIntentCookieHeader('google')}`
    );
    const res = createResponse();

    await controller.signInPage(req, res);

    expect(res.body).toContain('const hasAuthState = false;');
    expect(res.body).toContain('const autoSubmitProvider = null;');
    expect(res.clearCookie).toHaveBeenCalledWith(
      'idp-owox-verified-social-intent',
      expect.anything()
    );
  });

  it('does not auto-submit a query-only state with no verified action cookie (crafted-link check)', async () => {
    const controller = new PageController(providers);
    const req = createRequest({ state: 'attacker-supplied', pendingAction: 'google' });
    const res = createResponse();

    await controller.signInPage(req, res);

    // A bare link cannot supply the short-lived cookie written by the button POST.
    expect(res.body).toContain('const hasAuthState = true;');
    expect(res.body).toContain('const autoSubmitProvider = null;');
  });

  it('does not auto-submit a provider left in the params cookie without a verified button POST', async () => {
    const controller = new PageController(providers);
    const req = createRequest(
      { state: 'fresh-state' },
      paramsCookieHeader({ pendingAction: 'google' })
    );
    const res = createResponse();

    await controller.signInPage(req, res);

    expect(res.body).toContain('const autoSubmitProvider = null;');
  });

  it('does not auto-submit for a disabled provider even with a valid resume cookie', async () => {
    const controller = new PageController({ google: true, microsoft: false, email: true });
    const req = createRequest({ state: 'fresh-state' }, socialIntentCookieHeader('microsoft'));
    const res = createResponse();

    await controller.signInPage(req, res);

    expect(res.body).toContain('const autoSubmitProvider = null;');
  });

  it('auto-submits the pending Microsoft action on the sign-up page the same way', async () => {
    const controller = new PageController(providers);
    const req = createRequest({ state: 'fresh-state' }, socialIntentCookieHeader('microsoft'));
    const res = createResponse();

    await controller.signUpPage(req, res);

    expect(res.body).toContain('const autoSubmitProvider = "microsoft";');
  });
});
