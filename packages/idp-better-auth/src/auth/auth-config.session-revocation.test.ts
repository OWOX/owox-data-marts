import { afterEach, describe, expect, it } from '@jest/globals';
import Database from 'better-sqlite3';
import { getMigrations } from 'better-auth/db/migration';
import { createBetterAuthConfig } from './auth-config.js';
import type { BetterAuthConfig } from '../types/index.js';

/**
 * Security regression test: the exposed Better Auth `/change-password`
 * endpoint must revoke the user's other sessions even when the caller does not
 * opt in via `revokeOtherSessions`. The auth config forces it on via a hook.
 */
describe('idp-better-auth — change-password session invalidation', () => {
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

  function sessionTokens(): string[] {
    return (db.prepare('SELECT token FROM session').all() as Array<{ token: string }>).map(
      r => r.token
    );
  }

  it('revokes other sessions when the client omits revokeOtherSessions', async () => {
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
    expect(sessionTokens()).toHaveLength(2);

    const resp = await auth.api.changePassword({
      // intentionally no `revokeOtherSessions` — the config hook forces it
      body: { currentPassword: PASSWORD, newPassword: 'NewPassw0rd1' },
      headers: { cookie: `refreshToken=${tokenMatch![1]}` },
      asResponse: true,
    });
    expect(resp.status).toBe(200);

    const remaining = sessionTokens();
    expect(remaining).toHaveLength(1);
    expect(remaining).not.toContain(sessionAToken);
  });
});
