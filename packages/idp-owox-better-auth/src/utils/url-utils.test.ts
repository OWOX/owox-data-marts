import { describe, expect, it } from '@jest/globals';

import { isLocalhost, isSecureOrigin, tryNormalizeOrigin } from './url-utils.js';

describe('url-utils', () => {
  it('detects localhost hosts', () => {
    expect(isLocalhost('localhost')).toBe(true);
    expect(isLocalhost('127.0.0.1')).toBe(true);
    expect(isLocalhost('example.com')).toBe(false);
  });

  it('detects secure origins excluding localhost', () => {
    expect(isSecureOrigin('https:', 'example.com')).toBe(true);
    expect(isSecureOrigin('https:', 'localhost')).toBe(false);
    expect(isSecureOrigin('http:', 'example.com')).toBe(false);
  });

  it('normalizes origins or returns null on failure', () => {
    expect(tryNormalizeOrigin('https://example.com/path')).toBe('https://example.com');
    expect(tryNormalizeOrigin('not-a-url')).toBeNull();
  });
});
