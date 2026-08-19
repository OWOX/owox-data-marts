import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { SqliteDatabaseStore } from './sqlite-database-store.js';

type TestDb = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): Record<string, unknown> | undefined;
  };
};

describe('SqliteDatabaseStore extension auth storage', () => {
  let store: SqliteDatabaseStore;
  let db: TestDb;

  beforeEach(async () => {
    store = new SqliteDatabaseStore(':memory:');
    await store.initialize();
    db = (await store.getAdapter()) as TestDb;
    db.exec(`
      CREATE TABLE user (
        id TEXT NOT NULL PRIMARY KEY,
        email TEXT NOT NULL,
        emailVerified INTEGER,
        biUserId TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE TABLE account (
        id TEXT NOT NULL PRIMARY KEY,
        accountId TEXT NOT NULL,
        providerId TEXT NOT NULL,
        userId TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `);
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO user (id, email, emailVerified, biUserId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('user-1', 'one@example.com', 1, 'bi-user-1', now, now);
    db.prepare(
      'INSERT INTO user (id, email, emailVerified, biUserId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('user-2', 'two@example.com', 1, 'bi-user-2', now, now);
    await store.initializeExtensionAuthStorage();
  });

  afterEach(async () => {
    await store.shutdown();
  });

  it('atomically preserves one durable owner for a provider account', async () => {
    const [first, second] = await Promise.all([
      store.linkAccount('microsoft', 'oid:tid', 'user-1'),
      store.linkAccount('microsoft', 'oid:tid', 'user-2'),
    ]);

    expect(first.userId).toBe(second.userId);
    expect(['user-1', 'user-2']).toContain(first.userId);
    expect(db.prepare('SELECT COUNT(*) AS count FROM account').get()?.count).toBe(1);
  });

  it('allows exactly one consume for an assertion replay key', async () => {
    const expiresAt = new Date(Date.now() + 60_000);

    const results = await Promise.all([
      store.consumeExtensionAssertion('sha256:first', expiresAt),
      store.consumeExtensionAssertion('sha256:first', expiresAt),
    ]);

    expect(results.sort()).toEqual([false, true]);
  });
});
