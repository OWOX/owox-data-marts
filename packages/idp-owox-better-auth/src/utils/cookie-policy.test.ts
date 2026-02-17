import { describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

import {
  COOKIE_DEFAULT_PATH,
  buildCookieOptions,
  clearCookie,
  isSecureRequest,
  setCookie,
} from './cookie-policy.js';

const createReq = (protocol: string, hostname: string) =>
  ({ protocol, hostname }) as unknown as Request;

const createRes = () =>
  ({
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  }) as unknown as Response;

describe('cookie-policy', () => {
  it('detects secure requests only for https and non-localhost', () => {
    expect(isSecureRequest(createReq('https', 'app.example'))).toBe(true);
    expect(isSecureRequest(createReq('http', 'app.example'))).toBe(false);
    expect(isSecureRequest(createReq('https', 'localhost'))).toBe(false);
  });

  it('builds cookie options with defaults and maxAge', () => {
    const req = createReq('https', 'app.example');
    const options = buildCookieOptions(req, { maxAgeMs: 5000 });

    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: COOKIE_DEFAULT_PATH,
      secure: true,
      maxAge: 5000,
    });
  });

  it('sets cookie with shared options', () => {
    const req = createReq('http', 'localhost');
    const res = createRes();

    setCookie(res, req, 'test', 'value', { maxAgeMs: 1000 });

    expect(res.cookie).toHaveBeenCalledTimes(1);
    const call = (res.cookie as jest.Mock).mock.calls[0] ?? [];
    const [, , options] = call as [string, string, ReturnType<typeof buildCookieOptions>];
    expect(options).toMatchObject({ secure: false, maxAge: 1000, path: COOKIE_DEFAULT_PATH });
  });

  it('clears cookie with secure flags when request provided', () => {
    const req = createReq('https', 'app.example');
    const res = createRes();

    clearCookie(res, 'name', req);

    expect(res.clearCookie).toHaveBeenCalledWith('name', expect.objectContaining({ secure: true }));
  });

  it('clears cookie with default path when request is absent', () => {
    const res = createRes();

    clearCookie(res, 'name');

    expect(res.clearCookie).toHaveBeenCalledWith('name', { path: COOKIE_DEFAULT_PATH });
  });
});
