import { isTransientEmailError } from './transient-error.js';

describe('isTransientEmailError', () => {
  it.each([
    'SendGrid network error: ECONNRESET socket hang up',
    'SendGrid network error: ABORT_ERR This operation was aborted',
    'Email attempt timeout after 5000 ms',
    'SendGrid responded 429 Too Many Requests: rate limit',
    'SendGrid responded 503 Service Unavailable: ',
  ])('retries %s', message => {
    expect(isTransientEmailError(new Error(message))).toBe(true);
  });

  it.each([
    'SendGrid responded 400 Bad Request: invalid email',
    'SendGrid responded 401 Unauthorized: invalid key',
    'SendGrid responded 403 Forbidden: sender not verified',
  ])('does not retry %s', message => {
    expect(isTransientEmailError(new Error(message))).toBe(false);
  });

  it('does not retry a value that is not an error', () => {
    expect(isTransientEmailError('timeout')).toBe(false);
  });
});
