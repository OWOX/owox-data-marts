import { describe, expect, it } from 'vitest';
import { isStorageOAuthRefreshError } from '../storage-oauth-refresh-error.utils';

describe('isStorageOAuthRefreshError', () => {
  it('matches OAuth refresh error codes', () => {
    expect(isStorageOAuthRefreshError({ code: 'CREDENTIALS_EXPIRED' })).toBe(true);
    expect(isStorageOAuthRefreshError({ code: 'TOKEN_REFRESH_FAILED' })).toBe(true);
  });

  it('keeps legacy message fallback for older backend responses', () => {
    expect(isStorageOAuthRefreshError({ message: 'Failed to refresh OAuth tokens' })).toBe(true);
  });

  it('does not match unrelated errors', () => {
    expect(isStorageOAuthRefreshError({ code: 'VALIDATION_FAILED', message: 'Invalid SQL' })).toBe(
      false
    );
  });
});
