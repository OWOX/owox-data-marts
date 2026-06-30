import { afterEach, describe, expect, it } from '@jest/globals';
import Database from 'better-sqlite3';
import { getMigrations } from 'better-auth/db/migration';
import { createBetterAuthConfig } from './auth-config.js';
import type { BetterAuthConfig } from '../types/index.js';

/**
 * End-to-end security regression test: the exposed Better Auth `/change-password`
 * endpoint must revoke the user's other sessions even when the caller does not
 * opt in via `revokeOtherSessions`, while the acting session survives with a
 * freshly issued token (the password-changing user is not logged out).
 *
 * Needs better-sqlite3's native binding; skipped when it isn't built (e.g. the
 * `--ignore-scripts` CI job) so it never fails that job.
 */
let sqliteAvailable = false;
try {
  new Database(':memory:').close();
  sqliteAvailable = true;
} catch {
  sqliteAvailable = false;
}
const describeSqlite = sqliteAvailable ? describe : describe.skip;

describeSqlite('idp-better-auth — change-password session invalidation', () => {
  const EMAIL = 'user@test.io';
  const PASSWORD = 'Passw0rd1';

  let db: InstanceType<typeof Database>;

  afterEach(() => {
    db?.close();
  });

  async function buildAuth() {
    db = new Database(':memory:');
    const config = {
      baseURL: 'http://localhost:3000',
      secret: 'x'.repeat(40),
      magicLinkTtl: 3600,
    } as unknown as BetterAuthConfig;

    const auth = await createBetterAuthConfig(config, { adapter: db });
    const { runMigrations } = await getMigrations(auth.options);
    await runMigrations();
    return auth;
  }

  function sessionRows(): Array<{ token: string; userId: string }> {
    return db.prepare('SELECT token, userId FROM session').all() as Array<{
      token: string;
      userId: string;
    }>;
  }

  it('revokes other sessions and keeps the acting one when the client omits revokeOtherSessions', async () => {
    const auth = await buildAuth();

    const signUpRes = await auth.api.signUpEmail({
      body: { email: EMAIL, password: PASSWORD, name: 'User' },
      asResponse: true,
    });
    const setCookie = signUpRes.headers.get('set-cookie') ?? '';
    const tokenMatch = setCookie.match(/refreshToken=([^;]+)/);
    expect(tokenMatch?.[1]).toBeTruthy();
    const sessionAToken = decodeURIComponent(tokenMatch![1]).split('.')[0];

    // A second, independent session for the same user.
    await auth.api.signInEmail({ body: { email: EMAIL, password: PASSWORD } });
    expect(sessionRows()).toHaveLength(2);

    const resp = await auth.api.changePassword({
      // intentionally no `revokeOtherSessions` — the config hook forces it
      body: { currentPassword: PASSWORD, newPassword: 'NewPassw0rd1' },
      headers: { cookie: `refreshToken=${tokenMatch![1]}` },
      asResponse: true,
    });
    expect(resp.status).toBe(200);

    const remaining = sessionRows();
    expect(remaining).toHaveLength(1);
    // The acting session survives but with a rotated token (not session A's
    // pre-change token), proving the current user is not logged out.
    expect(remaining[0]!.token).not.toBe(sessionAToken);
    // ...and the surviving session belongs to the acting user.
    expect(remaining[0]!.userId).toBe(
      (db.prepare('SELECT id FROM user WHERE email = ?').get(EMAIL) as { id: string }).id
    );
  });
});
