/**
 * Tests for request utility functions.
 */
import { describe, expect, it, jest } from '@jest/globals';
import { type Request, type Response } from 'express';
import { SOURCE } from '../core/constants.js';
import {
  StateManager,
  clearPlatformCookies,
  extractPlatformParams,
  extractState,
  getStateManager,
  persistPlatformContext,
  setCookie,
} from './request-utils.js';

const createResponseMock = () =>
  ({
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  }) as unknown as Response;

describe('request-utils', () => {
  it('extracts state from cookie before query', () => {
    const req = {
      headers: { cookie: 'idp-owox-state=fromCookie;' },
      query: { state: 'queryState' },
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
      query: { state: 'queryState' },
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
    expect(clearCalls[0]?.[2]).toMatchObject({ secure: true, sameSite: 'lax' });
  });
});
