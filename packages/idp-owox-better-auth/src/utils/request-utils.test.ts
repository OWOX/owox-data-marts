/**
 * Tests for request utility functions.
 */
import { describe, expect, it, jest } from '@jest/globals';
import { type Request, type Response } from 'express';
import { SOURCE } from '../core/constants.js';
import {
  StateManager,
  clearBetterAuthCookies,
  clearAllAuthCookies,
  clearPlatformCookies,
  extractRefreshToken,
  extractPlatformParams,
  extractState,
  getCookie,
  getStateManager,
  persistPlatformContext,
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

  it('extracts platform params from cookie payload', () => {
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

    expect(extractPlatformParams(req)).toMatchObject({
      redirectTo: '/platform',
      appRedirectTo: '/app',
      source: SOURCE.PLATFORM,
      clientId: 'cid',
      codeChallenge: 'challenge',
    });
  });

  it('persists platform context to cookies', () => {
    const res = createResponseMock();
    const req = {
      protocol: 'https',
      hostname: 'app.example',
      headers: { cookie: '' },
      query: {},
    } as unknown as Request;

    persistPlatformContext(req, res, {
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

    clearPlatformCookies(res, req);

    const clearCalls = (res.clearCookie as jest.Mock).mock.calls;
    expect(clearCalls).toHaveLength(2);
    for (const call of clearCalls) {
      const options = findOptionsArg(call);
      expect(options).toMatchObject({ secure: true, sameSite: 'lax' });
    }
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

  it('extracts platform params from query when cookie payload is malformed', () => {
    const req = {
      headers: { cookie: 'idp-owox-params=%E0%A4%A' },
      query: { redirectTo: '/from-query' },
    } as unknown as Request;

    expect(extractPlatformParams(req)).toMatchObject({ redirectTo: '/from-query' });
  });

  it('clears all auth cookies (platform + better auth)', () => {
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
