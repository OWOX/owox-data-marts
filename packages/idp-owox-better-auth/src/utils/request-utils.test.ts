import { describe, expect, it, jest } from '@jest/globals';
import { type Request, type Response } from 'express';
import {
  extractPlatformParams,
  extractState,
  persistPlatformContext,
  setCookie,
} from './request-utils.js';

const createResponseMock = () =>
  ({
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as Response);

describe('request-utils', () => {
  it('extracts state from cookie before query', () => {
    const req = {
      headers: { cookie: 'idp-owox-state=fromCookie;' },
      query: { state: 'queryState' },
    } as unknown as Request;

    expect(extractState(req)).toBe('fromCookie');
  });

  it('extracts platform params from cookie payload', () => {
    const payload = encodeURIComponent(
      JSON.stringify({
        redirectTo: '/platform',
        appRedirectTo: '/app',
        source: 'platform',
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
      source: 'platform',
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
      params: { redirectTo: '/next', source: 'app' },
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
});
