import { describe, expect, it } from '@jest/globals';
import { buildPlatformRedirectUrl } from './platform-redirect-builder.js';

describe('platform-redirect-builder', () => {
  it('builds url with provided base and params', () => {
    const url = buildPlatformRedirectUrl({
      baseUrl: 'https://platform.test/ui/p/signin',
      code: 'CODE',
      state: 'STATE',
      params: {
        redirectTo: '/dashboard',
        appRedirectTo: '/auth/callback',
        source: 'app',
        clientId: 'client',
        codeChallenge: 'challenge',
      },
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
});
