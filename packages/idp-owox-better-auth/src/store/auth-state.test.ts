import { describe, expect, it, jest } from '@jest/globals';
import { MysqlDatabaseStore } from './mysql-database-store.js';
import { SqliteDatabaseStore } from './sqlite-database-store.js';
import { StoreResult } from './store-result.js';

const state = 'app-' + 'a'.repeat(43);
const verifier = 'verifier';
const params = { appRedirectTo: '/ui/project/data-marts' };

describe('Auth state is single use', () => {
  it('consumes SQLite state once even when two callbacks arrive together', async () => {
    const store = new SqliteDatabaseStore(':memory:');
    await store.saveAuthState(state, verifier, new Date(Date.now() + 60_000), params);

    const results = await Promise.all([store.getAuthState(state), store.getAuthState(state)]);

    expect(results).toEqual(
      expect.arrayContaining([StoreResult.withCode(verifier, params), StoreResult.notFound()])
    );
  });

  it('purges an expired SQLite state and keeps a live one', async () => {
    const store = new SqliteDatabaseStore(':memory:');
    const now = Date.now();
    await store.saveAuthState('expired-state', verifier, new Date(now - 1_000));
    await store.saveAuthState('live-state', verifier, new Date(now + 60_000), params);

    expect(await store.purgeExpiredAuthStates()).toBe(1);
    expect(await store.getAuthState('expired-state')).toEqual(StoreResult.notFound());
    expect(await store.getAuthState('live-state')).toEqual(StoreResult.withCode(verifier, params));
  });

  it('accepts only the MySQL callback whose delete removes the state', async () => {
    const store = new MysqlDatabaseStore({ host: '', user: '', password: '', database: '' });
    const row = {
      code_verifier: verifier,
      expires_at: null,
      platform_params: JSON.stringify(params),
    };
    // Both callbacks see the row before either commits a delete.
    const execute = jest.fn(async (query: string) => {
      if (query.startsWith('SELECT')) return [[row], undefined];
      throw new Error(`Unexpected MySQL query ${query}`);
    });
    execute
      .mockResolvedValueOnce([[row], undefined])
      .mockResolvedValueOnce([[row], undefined])
      .mockResolvedValueOnce([{ affectedRows: 1 }, undefined])
      .mockResolvedValueOnce([{ affectedRows: 0 }, undefined]);
    Object.assign(store, { authTableReady: true, pool: { execute } });

    const results = await Promise.all([store.getAuthState(state), store.getAuthState(state)]);

    expect(execute.mock.calls.map(([query]) => query.trimStart().split(' ')[0])).toEqual([
      'SELECT',
      'SELECT',
      'DELETE',
      'DELETE',
    ]);
    expect(results).toEqual(
      expect.arrayContaining([StoreResult.withCode(verifier, params), StoreResult.notFound()])
    );
  });
});
