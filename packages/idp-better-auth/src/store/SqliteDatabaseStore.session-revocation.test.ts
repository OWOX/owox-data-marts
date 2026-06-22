import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { createRequire } from 'node:module';
import { SqliteDatabaseStore } from './SqliteDatabaseStore.js';

/**
 * Verifies the raw SQL of the session-revocation helpers (notably the
 * `token != ?` filter and the `token`/`userId` column names) against a real
 * in-memory SQLite database, so a schema/column drift would be caught.
 *
 * better-sqlite3 ships a native binding that the unit-test CI job does not build
 * (it installs with `--ignore-scripts`). Probe the binding once and skip this
 * real-DB suite when it's unavailable, so it still runs locally and in any
 * native-enabled job without failing the `--ignore-scripts` job.
 */
const require = createRequire(import.meta.url);
let sqliteAvailable = false;
try {
  const Database = require('better-sqlite3');
  new Database(':memory:').close();
  sqliteAvailable = true;
} catch {
  sqliteAvailable = false;
}
const describeSqlite = sqliteAvailable ? describe : describe.skip;

describeSqlite('SqliteDatabaseStore — session revocation SQL', () => {
  let store: SqliteDatabaseStore;
  let db: {
    prepare: (sql: string) => {
      run: (...args: unknown[]) => unknown;
      all: () => Array<{ token: string; userId: string }>;
    };
  };

  beforeEach(async () => {
    store = new SqliteDatabaseStore(':memory:');
    await store.connect();
    // Use the public adapter rather than reaching into a private field, so the
    // test survives internal refactors of the store.
    db = (await store.getAdapter()) as typeof db;
    db.prepare('CREATE TABLE session (token TEXT PRIMARY KEY, userId TEXT)').run();
    db.prepare('INSERT INTO session (token, userId) VALUES (?, ?)').run('tok-current', 'user-1');
    db.prepare('INSERT INTO session (token, userId) VALUES (?, ?)').run('tok-other', 'user-1');
    db.prepare('INSERT INTO session (token, userId) VALUES (?, ?)').run('tok-elsewhere', 'user-2');
  });

  afterEach(async () => {
    await store.shutdown();
  });

  function rows(): Array<{ token: string; userId: string }> {
    return db.prepare('SELECT token, userId FROM session').all();
  }

  function tokensFor(userId: string): string[] {
    return rows()
      .filter(r => r.userId === userId)
      .map(r => r.token);
  }

  it('revokeOtherUserSessions deletes all of the user’s sessions except the current one', async () => {
    await store.revokeOtherUserSessions('user-1', 'tok-current');

    expect(tokensFor('user-1')).toEqual(['tok-current']);
    // Other users are untouched.
    expect(tokensFor('user-2')).toEqual(['tok-elsewhere']);
  });

  it('revokeUserSessions deletes every session for the user', async () => {
    await store.revokeUserSessions('user-1');

    expect(tokensFor('user-1')).toEqual([]);
    expect(tokensFor('user-2')).toEqual(['tok-elsewhere']);
  });
});
