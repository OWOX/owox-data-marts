import { describe, expect, it } from '@jest/globals';
import { forceRevokeOtherSessionsOnChangePassword } from './auth-config.js';

/**
 * Pure unit test for the forced change-password revoke hook — no database, so it
 * runs in the standard CI job. Asserts the `before` hook mutates the body for
 * `/change-password` and leaves other paths untouched.
 */
describe('forceRevokeOtherSessionsOnChangePassword', () => {
  it('forces revokeOtherSessions and preserves the existing body on /change-password', () => {
    expect(
      forceRevokeOtherSessionsOnChangePassword({
        path: '/change-password',
        body: { currentPassword: 'a', newPassword: 'b' },
      })
    ).toEqual({
      context: { body: { currentPassword: 'a', newPassword: 'b', revokeOtherSessions: true } },
    });
  });

  it('works when the request carries no body', () => {
    expect(forceRevokeOtherSessionsOnChangePassword({ path: '/change-password' })).toEqual({
      context: { body: { revokeOtherSessions: true } },
    });
  });

  it('leaves other paths untouched', () => {
    expect(
      forceRevokeOtherSessionsOnChangePassword({ path: '/sign-in/email', body: { x: 1 } })
    ).toBeUndefined();
  });
});
