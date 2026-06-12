import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { SqliteDatabaseStore } from './SqliteDatabaseStore.js';

/**
 * Verifies the raw SQL of the session-revocation helpers against a real
 * in-memory SQLite database.
 */
describe('SqliteDatabaseStore — session revocation SQL', () => {
  let store: SqliteDatabaseStore;

  beforeEach(async () => {
    store = new SqliteDatabaseStore(':memory:');
    await store.connect();
    const db = (await store.getAdapter()) as {
      prepare: (sql: string) => { run: (...args: unknown[]) => unknown };
    };
    db.prepare('CREATE TABLE session (token TEXT PRIMARY KEY, userId TEXT)').run();
    db.prepare('INSERT INTO session (token, userId) VALUES (?, ?)').run('tok-current', 'user-1');
    db.prepare('INSERT INTO session (token, userId) VALUES (?, ?)').run('tok-other', 'user-1');
    db.prepare('INSERT INTO session (token, userId) VALUES (?, ?)').run('tok-elsewhere', 'user-2');
  });

  afterEach(async () => {
    await store.shutdown();
  });

  function rows(): Array<{ token: string; userId: string }> {
    const adapter = (
      store as unknown as {
        db: { prepare: (sql: string) => { all: () => Array<{ token: string; userId: string }> } };
      }
    ).db;
    return adapter.prepare('SELECT token, userId FROM session').all();
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
