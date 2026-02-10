/**
 * Tests for Platform redirect URL helpers.
 */
import { describe, expect, it } from '@jest/globals';
import { SOURCE } from '../constants.js';
import {
  buildPlatformEntryUrl,
  buildPlatformRedirectUrl,
  sanitizeRedirectParam,
} from './platform-redirect-builder.js';

describe('platform-redirect-builder', () => {
  it('builds url with provided base and params', () => {
    const url = buildPlatformRedirectUrl({
      baseUrl: 'https://platform.test/ui/p/signin',
      code: 'CODE',
      state: 'STATE',
      params: {
        redirectTo: '/dashboard',
        appRedirectTo: '/auth/callback',
        source: SOURCE.APP,
        clientId: 'client',
        codeChallenge: 'challenge',
      },
      allowedRedirectOrigins: ['https://platform.test'],
    });

    expect(url?.toString()).toContain('code=CODE');
    expect(url?.searchParams.get('redirect-to')).toBe('/dashboard');
    expect(url?.searchParams.get('app-redirect-to')).toBe('/auth/callback');
  });

  it('falls back to signInUrl origin when baseUrl is missing', () => {
    const url = buildPlatformRedirectUrl({
      baseUrl: undefined,
      signInUrl: 'https://platform.test/ui/p/any',
      code: 'code1',
      state: 'state1',
      params: {},
    });

    expect(url?.pathname).toBe('/signin');
  });

  it('builds entry url with params', () => {
    const url = buildPlatformEntryUrl({
      authUrl: 'https://platform.test/ui/p/signin',
      defaultSource: SOURCE.APP,
      params: {
        redirectTo: '/dashboard',
        appRedirectTo: '/auth/callback',
        projectId: 'p1',
      },
      allowedRedirectOrigins: ['https://platform.test'],
    });

    expect(url.toString()).toContain(`source=${SOURCE.APP}`);
    expect(url.searchParams.get('redirect-to')).toBe('/dashboard');
    expect(url.searchParams.get('app-redirect-to')).toBe('/auth/callback');
    expect(url.searchParams.get('projectId')).toBe('p1');
  });

  it('drops redirect params with disallowed origins', () => {
    const allowed = ['https://platform.test'];
    expect(sanitizeRedirectParam('https://evil.test/path', allowed)).toBeUndefined();
    expect(sanitizeRedirectParam('https://platform.test/welcome', allowed)).toBe(
      'https://platform.test/welcome'
    );
  });
});
