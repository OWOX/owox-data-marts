import type { QueryRunner } from 'typeorm';
import { ConvertDestinationCredentials1792700000000 } from './1792700000000-convert-destination-credentials';

const WEBHOOK_URL = 'https://chat.googleapis.com/v1/spaces/s/messages?key=k&token=leaked-secret';

const DESTINATION = {
  id: 'destination-1',
  projectId: 'project-1',
  title: 'Alerts',
  type: 'GOOGLE_CHAT',
  createdAt: '2026-01-01 00:00:00',
  keyType: 'google_chat_webhook',
  keyCredentials: JSON.stringify({ type: 'google-chat-credentials', webhookUrl: WEBHOOK_URL }),
  keyIdentity: null,
};

/** A runner whose read finds one Destination on an old key; `insert` answers every write. */
function runnerFor(type: string, insert: () => Promise<unknown> = async () => []) {
  const query = jest.fn(async (sql: string) => {
    if (sql.trimStart().startsWith('INSERT')) return insert();
    return sql.includes('AS keyCredentials') ? [DESTINATION] : [];
  });
  const runner = {
    connection: { options: { type } },
    isTransactionActive: true,
    query,
  } as unknown as QueryRunner;
  return { runner, query };
}

describe('ConvertDestinationCredentials1792700000000', () => {
  const migration = new ConvertDestinationCredentials1792700000000();

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

    for (const { query } of [sqlite, mysqlOutside]) {
      expect(query.mock.calls.map(([sql]) => sql)).not.toContain('START TRANSACTION');
      expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO credential '), [
        expect.any(String),
        'project-1',
        'Alerts',
        'google-chat-webhook',
        JSON.stringify({ fields: { webhookUrl: WEBHOOK_URL } }),
        JSON.stringify({ fields: {} }),
      ]);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO credential_consumer_binding'),
        [
          expect.any(String),
          'project-1',
          expect.any(String),
          'destination',
          'destination-1',
          'destination',
          JSON.stringify({ definitionIds: ['google-chat-webhook'], scopes: [] }),
          expect.any(String),
        ]
      );
    }
  });

  it('changes no data on down()', async () => {
    const { runner, query } = runnerFor('better-sqlite3');

    await (migration.down as (queryRunner: QueryRunner) => Promise<void>)(runner);

    expect(query).not.toHaveBeenCalled();
  });

  it('fails with the message of a failed write only, never its parameters', async () => {
    const failure = Object.assign(new Error('insert failed'), {
      query: 'INSERT INTO credential',
      parameters: [JSON.stringify({ fields: { webhookUrl: WEBHOOK_URL } })],
    });
    const { runner } = runnerFor('better-sqlite3', async () => {
      throw failure;
    });

    const error = await migration.up(runner).then(
      () => null,
      (thrown: unknown) => thrown
    );

    expect(error).toEqual(new Error('Destination keys were not converted: insert failed'));
    expect(error).not.toBe(failure);
    expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain('leaked-secret');
  });
});
