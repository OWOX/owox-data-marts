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

    expect(res.body).toContain('let hasAuthState = false;');
    expect(res.body).toContain('const autoSubmitProvider = null;');
  });

  it('auto-submits the pending Google action once state has come back, and clears pendingAction (single use)', async () => {
    const controller = new PageController(providers);
    const req = createRequest(
      { state: 'fresh-state' },
      paramsCookieHeader({ pendingAction: 'google', redirectTo: '/dashboard' })
    );
    const res = createResponse();

    await controller.signInPage(req, res);

    expect(res.body).toContain('let hasAuthState = true;');
    expect(res.body).toContain('const autoSubmitProvider = "google";');

    const persisted = lastParamsCookieValue(res);
    expect(persisted?.pendingAction).toBeUndefined();
    expect(persisted?.redirectTo).toBe('/dashboard');
  });

  it('does not auto-submit for a pending email action - the user must submit the form themselves', async () => {
    const controller = new PageController(providers);
    const req = createRequest(
      { state: 'fresh-state' },
      paramsCookieHeader({ pendingAction: 'email' })
    );
    const res = createResponse();

    await controller.signInPage(req, res);

    expect(res.body).toContain('let hasAuthState = true;');
    expect(res.body).toContain('const autoSubmitProvider = null;');
  });

  it('never auto-submits when there is no state yet, even if a stale pendingAction cookie exists', async () => {
    const controller = new PageController(providers);
    const req = createRequest({}, paramsCookieHeader({ pendingAction: 'google' }));
    const res = createResponse();

    await controller.signInPage(req, res);

    expect(res.body).toContain('let hasAuthState = false;');
    expect(res.body).toContain('const autoSubmitProvider = null;');
  });

  it('auto-submits the pending Microsoft action on the sign-up page the same way', async () => {
    const controller = new PageController(providers);
    const req = createRequest(
      { state: 'fresh-state' },
      paramsCookieHeader({ pendingAction: 'microsoft' })
    );
    const res = createResponse();

    await controller.signUpPage(req, res);

    expect(res.body).toContain('const hasAuthState = true;');
    expect(res.body).toContain('const autoSubmitProvider = "microsoft";');
  });
});
