import { isInvalidRefreshTokenError } from './google-oauth.utils';

describe('isInvalidRefreshTokenError', () => {
  it.each([
    ['the error code', { response: { data: { error: 'invalid_grant' } } }],
    [
      'the description',
      { response: { data: { error: 'bad', error_description: 'Token invalid_grant' } } },
    ],
    ['the message', new Error('invalid_grant: Token has been expired or revoked.')],
  ])('treats invalid_grant in %s as a lost grant', (_where, error) => {
    expect(isInvalidRefreshTokenError(error)).toBe(true);
  });

  it.each([
    ['a server error', new Error('Request failed with status code 503')],
    ['another Google error', { response: { data: { error: 'invalid_client' } } }],
    ['a value that is not an error', 'invalid_grant'],
  ])('does not treat %s as a lost grant', (_what, error) => {
    expect(isInvalidRefreshTokenError(error)).toBe(false);
  });
});
