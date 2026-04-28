import { isIdpNotFoundError } from './is-idp-not-found-error';

describe('isIdpNotFoundError', () => {
  it('returns false for non-Error values', () => {
    expect(isIdpNotFoundError(null)).toBe(false);
    expect(isIdpNotFoundError(undefined)).toBe(false);
    expect(isIdpNotFoundError('not found')).toBe(false);
    expect(isIdpNotFoundError({ status: 404 })).toBe(false);
    expect(isIdpNotFoundError(404)).toBe(false);
  });

  it('returns true when the Error name matches the upstream exception class', () => {
    // The primary signal: name-based detection lets callers stay free of a
    // runtime import from the ESM-only `@owox/idp-owox-better-auth` package.
    const err = new Error('upstream member missing');
    err.name = 'IdpNotFoundException';
    expect(isIdpNotFoundError(err)).toBe(true);
  });

  it('returns true when an Error carries status === 404 (transport repackaging)', () => {
    const err = Object.assign(new Error('not found'), { status: 404 });
    expect(isIdpNotFoundError(err)).toBe(true);
  });

  it('returns false for Errors with a non-404 status', () => {
    const e500 = Object.assign(new Error('boom'), { status: 500 });
    const e401 = Object.assign(new Error('auth'), { status: 401 });
    expect(isIdpNotFoundError(e500)).toBe(false);
    expect(isIdpNotFoundError(e401)).toBe(false);
  });

  it('returns false for plain Errors with no status and a generic name', () => {
    expect(isIdpNotFoundError(new Error('something else'))).toBe(false);
    expect(isIdpNotFoundError(new TypeError('bad cast'))).toBe(false);
  });

  it('returns false when status is a non-number (e.g. "404" string)', () => {
    const err = Object.assign(new Error('weird'), { status: '404' });
    expect(isIdpNotFoundError(err)).toBe(false);
  });

  it('narrows the type to Error when truthy', () => {
    const err: unknown = Object.assign(new Error('x'), { status: 404 });
    if (isIdpNotFoundError(err)) {
      expect(typeof err.message).toBe('string');
    }
  });
});
