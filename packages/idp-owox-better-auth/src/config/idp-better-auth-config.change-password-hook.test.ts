import { describe, expect, it } from '@jest/globals';
import { forceRevokeOtherSessionsOnChangePassword } from './idp-better-auth-config.js';

/**
 * Pure unit test for the forced change-password revoke hook in the OWOX config —
 * no database, so it runs in the standard CI job. The OWOX Better Auth instance
 * is reached through BetterAuthProxyHandler, which forwards every
 * `/better-auth/*` route, so the hook must force `revokeOtherSessions` on
 * `/change-password` regardless of what the client sends.
 */
describe('forceRevokeOtherSessionsOnChangePassword (owox)', () => {
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
