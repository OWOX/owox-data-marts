import { afterEach, describe, expect, it } from '@jest/globals';
import Database from 'better-sqlite3';
import { getMigrations } from 'better-auth/db/migration';
import { createBetterAuthConfig } from './idp-better-auth-config.js';
import { BETTER_AUTH_SESSION_COOKIE } from '../core/constants.js';
import type { BetterAuthConfig } from '../types/index.js';

/**
 * Security regression test: in the OWOX variant the Better Auth
 * `/change-password` endpoint is reached through BetterAuthProxyHandler, which
 * forwards every `/better-auth/*` route. The config hook must force
 * `revokeOtherSessions` on so a password change always revokes the user's other
 * sessions, even when the client omits the flag.
 */
describe('idp-owox-better-auth — change-password session invalidation', () => {
  const EMAIL = 'user@test.io';
  const PASSWORD = 'Passw0rd1';
  const escapedCookie = BETTER_AUTH_SESSION_COOKIE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

    const auth = await createBetterAuthConfig(config, {
      adapter: db,
      magicLinkSender: async () => {},
      resetPasswordSender: async () => {},
    });
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
    const tokenMatch = setCookie.match(new RegExp(`${escapedCookie}=([^;]+)`));
    expect(tokenMatch?.[1]).toBeTruthy();
    const sessionAToken = decodeURIComponent(tokenMatch![1]).split('.')[0];

    // A second, independent session for the same user.
    await auth.api.signInEmail({ body: { email: EMAIL, password: PASSWORD } });
    expect(sessionTokens()).toHaveLength(2);

    const resp = await auth.api.changePassword({
      // intentionally no `revokeOtherSessions` — the config hook forces it
      body: { currentPassword: PASSWORD, newPassword: 'NewPassw0rd1' },
      headers: { cookie: `${BETTER_AUTH_SESSION_COOKIE}=${tokenMatch![1]}` },
      asResponse: true,
    });
    expect(resp.status).toBe(200);

    const remaining = sessionTokens();
    expect(remaining).toHaveLength(1);
    expect(remaining).not.toContain(sessionAToken);
  });
});
