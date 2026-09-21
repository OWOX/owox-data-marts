import { isAuthenticationError } from './is-authentication-error';

describe('isAuthenticationError', () => {
  it('returns false for non-Error values', () => {
    expect(isAuthenticationError(null)).toBe(false);
    expect(isAuthenticationError(undefined)).toBe(false);
    expect(isAuthenticationError('unauthorized')).toBe(false);
    expect(isAuthenticationError({ status: 401 })).toBe(false);
    expect(isAuthenticationError(401)).toBe(false);
  });

  it('returns true when the Error name matches the upstream exception class', () => {
    // The primary signal: name-based detection lets callers stay free of a
    // runtime import from the ESM-only `@owox/idp-owox-better-auth` package.
    const err = new Error('Invalid or expired credentials');
    err.name = 'AuthenticationException';
    expect(isAuthenticationError(err)).toBe(true);
  });

  it('returns true when an Error carries status === 401 (transport repackaging)', () => {
    const err = Object.assign(new Error('unauthorized'), { status: 401 });
    expect(isAuthenticationError(err)).toBe(true);
  });

  it('returns false for Errors with a non-401 status', () => {
    const e500 = Object.assign(new Error('boom'), { status: 500 });
    const e404 = Object.assign(new Error('missing'), { status: 404 });
    expect(isAuthenticationError(e500)).toBe(false);
    expect(isAuthenticationError(e404)).toBe(false);
  });

  it('returns false for plain Errors with no status and a generic name', () => {
    expect(isAuthenticationError(new Error('something else'))).toBe(false);
    expect(isAuthenticationError(new TypeError('bad cast'))).toBe(false);
  });

  it('returns false when status is a non-number (e.g. "401" string)', () => {
    const err = Object.assign(new Error('weird'), { status: '401' });
    expect(isAuthenticationError(err)).toBe(false);
  });

  it('narrows the type to Error when truthy', () => {
    const err: unknown = Object.assign(new Error('x'), { status: 401 });
    if (isAuthenticationError(err)) {
      expect(typeof err.message).toBe('string');
    }
  });
});
