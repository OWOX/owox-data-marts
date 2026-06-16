/**
 * Tests for request utility functions.
 */
import { describe, expect, it, jest } from '@jest/globals';
import { type Request, type Response } from 'express';
import { SOURCE } from '../core/constants.js';
import {
  StateManager,
  clearAuthFlowCookies,
  clearAuthFlowStateCookie,
  clearBetterAuthCookies,
  clearAllAuthCookies,
  extractRefreshToken,
  extractAuthFlowParams,
  extractState,
  getCookie,
  getStateManager,
  parseAuthFlowParams,
  parseSerializedAuthFlowParams,
  persistAuthFlowContext,
  serializeAuthFlowParams,
  setCookie,
} from './request-utils.js';

const createResponseMock = () =>
  ({
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  }) as unknown as Response;

const findOptionsArg = (callArgs: unknown[]): Record<string, unknown> | undefined =>
  callArgs.find(arg => typeof arg === 'object' && arg !== null) as
    | Record<string, unknown>
    | undefined;

describe('request-utils', () => {
  it('extracts state from cookie before query', () => {
    const req = {
      headers: { cookie: 'idp-owox-state=fromCookie;' },
      query: {},
    } as unknown as Request;

    const manager = new StateManager(req);
    expect(manager.extract()).toBe('fromCookie');
  });

  it('returns empty state on mismatch', () => {
    const req = {
      headers: { cookie: 'idp-owox-state=fromCookie;' },
      query: { state: 'otherState' },
    } as unknown as Request;

    const manager = new StateManager(req);

    expect(manager.hasMismatch()).toBe(true);
    expect(manager.extract()).toBe('');
  });

  it('reuses cached state manager on the same request', () => {
    const req = {
      headers: { cookie: 'idp-owox-state=fromCookie;' },
      query: { state: 'fromCookie' },
    } as unknown as Request;

    const first = getStateManager(req);
    expect(extractState(req)).toBe('fromCookie');
    expect(getStateManager(req)).toBe(first);
  });

  it('extracts auth flow params from cookie payload', () => {
    const payload = encodeURIComponent(
      JSON.stringify({
        redirectTo: '/platform',
        appRedirectTo: '/app',
        source: SOURCE.PLATFORM,
        clientId: 'cid',
        codeChallenge: 'challenge',
      })
    );
    const req = {
      headers: { cookie: `idp-owox-params=${payload};` },
      query: {},
    } as unknown as Request;

    expect(extractAuthFlowParams(req)).toMatchObject({
      redirectTo: '/platform',
      appRedirectTo: '/app',
      source: SOURCE.PLATFORM,
      clientId: 'cid',
      codeChallenge: 'challenge',
    });
  });

  it('serializes auth flow params without empty payloads', () => {
    expect(serializeAuthFlowParams({})).toBeNull();
    expect(
      serializeAuthFlowParams({
        redirectTo: '/platform',
        appRedirectTo: '/app',
        source: SOURCE.PLATFORM,
        projectId: 'project_1',
        extraParams: { ui_locales: 'en-US' },
      })
    ).toBe(
      JSON.stringify({
        redirectTo: '/platform',
        appRedirectTo: '/app',
        source: SOURCE.PLATFORM,
        projectId: 'project_1',
        extraParams: { ui_locales: 'en-US' },
      })
    );
  });

  it('parses persisted auth flow params with schema validation', () => {
    expect(
      parseSerializedAuthFlowParams(
        JSON.stringify({
          redirectTo: '/platform',
          projectId: '../invalid',
          extraParams: { ui_locales: 'en-US', ignored: 123 },
          ignoredRoot: true,
        })
      )
    ).toEqual({
      redirectTo: '/platform',
      projectId: undefined,
      extraParams: { ui_locales: 'en-US' },
    });

    expect(parseSerializedAuthFlowParams('{')).toBeUndefined();
    expect(parseAuthFlowParams(null)).toBeUndefined();
  });

  it('prefers current query continuation over stale cookie payload', () => {
    const payload = encodeURIComponent(
      JSON.stringify({
        redirectTo: '/oauth/authorize?client_id=stale-client&state=stale-state',
        appRedirectTo: '/oauth/authorize?client_id=stale-client&state=stale-state',
        source: SOURCE.PLATFORM,
      })
    );
    const req = {
      headers: { cookie: `idp-owox-params=${payload};` },
      query: {
        redirect: '/oauth/authorize?client_id=fresh-client&state=fresh-state',
        'app-redirect-to': '/oauth/authorize?client_id=fresh-client&state=fresh-state',
      },
    } as unknown as Request;

    expect(extractAuthFlowParams(req)).toMatchObject({
      redirectTo: '/oauth/authorize?client_id=fresh-client&state=fresh-state',
      appRedirectTo: '/oauth/authorize?client_id=fresh-client&state=fresh-state',
      source: SOURCE.PLATFORM,
    });
  });

  it('persists auth flow context to cookies', () => {
    const res = createResponseMock();
    const req = {
      protocol: 'https',
      hostname: 'app.example',
      headers: { cookie: '' },
      query: {},
    } as unknown as Request;

    persistAuthFlowContext(req, res, {
      state: 'state123',
      params: { redirectTo: '/next', source: SOURCE.APP },
    });

    const cookieCalls = (res.cookie as jest.Mock).mock.calls;

    expect(cookieCalls).toHaveLength(2);
    expect(cookieCalls[0]?.[0]).toBe('idp-owox-params');
    expect(cookieCalls[1]?.[0]).toBe('idp-owox-state');
  });

  it('sets secure flag based on request protocol', () => {
    const res = createResponseMock();
    const req = {
      protocol: 'https',
      hostname: 'app.example',
    } as unknown as Request;

    setCookie(res, req, 'test', 'value');

    const cookieCalls = (res.cookie as jest.Mock).mock.calls;

    expect(cookieCalls).toHaveLength(1);
    expect(cookieCalls[0]?.[2]).toMatchObject({ secure: true });
  });

  it('clears cookies with secure options when request provided', () => {
    const res = createResponseMock();
    const req = {
      protocol: 'https',
      hostname: 'app.example',
    } as unknown as Request;

    clearAuthFlowCookies(res, req);

    const clearCalls = (res.clearCookie as jest.Mock).mock.calls;
    expect(clearCalls).toHaveLength(2);
    for (const call of clearCalls) {
      const options = findOptionsArg(call);
      expect(options).toMatchObject({ secure: true, sameSite: 'lax' });
    }
  });

  it('clears only auth flow state cookie', () => {
    const res = createResponseMock();
    const req = {
      protocol: 'https',
      hostname: 'app.example',
    } as unknown as Request;

    clearAuthFlowStateCookie(res, req);

    const clearCalls = (res.clearCookie as jest.Mock).mock.calls;
    expect(clearCalls).toHaveLength(1);
    expect(clearCalls[0]?.[0]).toBe('idp-owox-state');
    expect(clearCalls[0]?.[1]).toMatchObject({ secure: true, sameSite: 'lax' });
  });

  it('clears Better Auth cookies with secure and host prefixes', () => {
    const res = createResponseMock();
    const req = {
      protocol: 'https',
      hostname: 'app.example',
    } as unknown as Request;

    clearBetterAuthCookies(res, req);

    const clearCalls = (res.clearCookie as jest.Mock).mock.calls;
    const names = clearCalls.map(call => call[0]);
    expect(names).toEqual(
      expect.arrayContaining([
        'better-auth.session_token',
        '__Secure-better-auth.session_token',
        '__Host-better-auth.session_token',
        'better-auth.csrf_token',
        '__Secure-better-auth.csrf_token',
        '__Host-better-auth.csrf_token',
        'better-auth.state',
        '__Secure-better-auth.state',
        '__Host-better-auth.state',
      ])
    );
    for (const call of clearCalls) {
      const options = findOptionsArg(call);
      expect(options).toMatchObject({ secure: true, sameSite: 'lax' });
    }
  });

  it('decodes percent-encoded cookies when reading', () => {
    const req = {
      headers: { cookie: 'token=hello%20world;' },
      query: {},
    } as unknown as Request;

    expect(getCookie(req, 'token')).toBe('hello world');
  });

  it('extracts auth flow params from query when cookie payload is malformed', () => {
    const req = {
      headers: { cookie: 'idp-owox-params=%E0%A4%A' },
      query: { redirectTo: '/from-query' },
    } as unknown as Request;

    expect(extractAuthFlowParams(req)).toMatchObject({ redirectTo: '/from-query' });
  });

  it('extracts legacy redirect query param as redirectTo for auth continuations', () => {
    const req = {
      headers: { cookie: '' },
      query: { redirect: '/oauth/authorize?client_id=mcp-client' },
    } as unknown as Request;

    expect(extractAuthFlowParams(req)).toEqual({
      redirectTo: '/oauth/authorize?client_id=mcp-client',
      appRedirectTo: undefined,
      source: undefined,
      clientId: undefined,
      codeChallenge: undefined,
      projectId: undefined,
      extraParams: undefined,
    });
  });

  it('clears all auth cookies (auth flow + better auth)', () => {
    const res = createResponseMock();
    const req = {
      protocol: 'https',
      hostname: 'app.example',
    } as unknown as Request;

    clearAllAuthCookies(res, req);

    const clearCalls = (res.clearCookie as jest.Mock).mock.calls.flatMap(call => call[0]);
    expect(clearCalls).toEqual(expect.arrayContaining(['idp-owox-state', 'idp-owox-params']));
    expect(clearCalls).toEqual(expect.arrayContaining(['better-auth.session_token']));
  });

  it('extracts refresh token from cookies', () => {
    const req = {
      headers: { cookie: 'refreshToken=refresh123;' },
    } as unknown as Request;

    expect(extractRefreshToken(req)).toBe('refresh123');
  });
});
