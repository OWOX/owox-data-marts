import type { QueryRunner } from 'typeorm';
import { sourceCredentialRequirement } from '../data-marts/connector-types/source-credential-state';
import { ConvertSourceCredentials1793000000000 } from './1793000000000-convert-source-credentials';

const DATA_MART = {
  id: 'data-mart-1',
  projectId: 'project-1',
  title: 'Stars',
  createdAt: '2026-01-01 00:00:00',
  definition: JSON.stringify({
    connector: {
      source: {
        name: 'GitHub',
        configuration: [{ _id: 'config-1', _secrets_id: 'row-1' }],
        node: 'stars',
        fields: ['date'],
      },
      storage: { fullyQualifiedName: 'dataset.stars' },
    },
  }),
};

const OLD_ROW = {
  id: 'row-1',
  projectId: 'project-1',
  connectorName: 'GitHub',
  userId: null,
  credentials: JSON.stringify({ AccessToken: 'leaked-secret' }),
  keyUser: null,
  expiresAt: null,
};

/** A runner whose reads find one GitHub Data Mart on an old key; `insert` answers every write. */
function runnerFor(type: string, insert: () => Promise<unknown> = async () => []) {
  const query = jest.fn(async (sql: string) => {
    if (sql.trimStart().startsWith('INSERT')) return insert();
    if (sql.includes('AS definition')) return [DATA_MART];
    return sql.includes('FROM connector_source_credentials') ? [OLD_ROW] : [];
  });
  const runner = {
    connection: { options: { type } },
    isTransactionActive: true,
    query,
  } as unknown as QueryRunner;
  return { runner, query };
}

describe('ConvertSourceCredentials1793000000000', () => {
  const migration = new ConvertSourceCredentials1793000000000();

  it('opens its own transaction on MySQL, where earlier DDL has committed the runner one', async () => {
    for (const type of ['mysql', 'mariadb']) {
      const { runner, query } = runnerFor(type);

      await migration.up(runner);

      expect(query.mock.calls[0]).toEqual(['START TRANSACTION']);
    }
  });

  it('leaves the transaction to the runner on SQLite and outside a runner transaction', async () => {
    const sqlite = runnerFor('better-sqlite3');
    const mysqlOutside = runnerFor('mysql');
    (mysqlOutside.runner as { isTransactionActive: boolean }).isTransactionActive = false;

    await migration.up(sqlite.runner);
    await migration.up(mysqlOutside.runner);

    const requirement = sourceCredentialRequirement();
    for (const { query } of [sqlite, mysqlOutside]) {
      expect(query.mock.calls.map(([sql]) => sql)).not.toContain('START TRANSACTION');
      expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO credential '), [
        expect.any(String),
        'project-1',
        'GitHub — Stars',
        'github',
        JSON.stringify({ value: 'leaked-secret' }),
        null,
      ]);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO credential_consumer_binding'),
        [
          expect.any(String),
          'project-1',
          expect.any(String),
          'connector-config',
          'data-mart-1',
          'config-1',
          JSON.stringify(requirement),
          expect.any(String),
        ]
      );
    }
  });

  it('fails with the message of a failed write only, never its parameters', async () => {
    const failure = Object.assign(new Error('insert failed'), {
      query: 'INSERT INTO credential',
      parameters: [JSON.stringify({ value: 'leaked-secret' })],
    });
    const { runner } = runnerFor('better-sqlite3', async () => {
      throw failure;
    });

    const error = await migration.up(runner).then(
      () => null,
      (thrown: unknown) => thrown
    );

    expect(error).toEqual(new Error('Source keys were not converted: insert failed'));
    expect(error).not.toBe(failure);
    expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain('leaked-secret');
  });
});
