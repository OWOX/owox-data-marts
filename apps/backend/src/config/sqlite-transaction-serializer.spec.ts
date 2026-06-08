import { DataSource, EntityManager } from 'typeorm';
import { serializeSqliteTransactions } from './sqlite-transaction-serializer';

describe('serializeSqliteTransactions', () => {
  it('serializes concurrent better-sqlite3 transactions while preserving nested transactions', async () => {
    const dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
    });

    await dataSource.initialize();
    serializeSqliteTransactions(dataSource);

    try {
      await dataSource.query('CREATE TABLE transaction_test (id integer primary key, label text)');

      const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      const activeTopLevelTransactions = new Set<string>();
      const executionOrder: string[] = [];
      let maxActiveTopLevelTransactions = 0;

      const runWork = async (label: string, delays: [number, number, number]) => {
        await dataSource.transaction(async outerManager => {
          activeTopLevelTransactions.add(label);
          executionOrder.push(`start:${label}`);
          maxActiveTopLevelTransactions = Math.max(
            maxActiveTopLevelTransactions,
            activeTopLevelTransactions.size
          );

          try {
            await outerManager.query('INSERT INTO transaction_test(label) VALUES (?)', [
              `${label}-outer`,
            ]);
            await wait(delays[0]);

            await dataSource.transaction(async innerManager => {
              await innerManager.query('INSERT INTO transaction_test(label) VALUES (?)', [
                `${label}-inner`,
              ]);
              await wait(delays[1]);
            });

            await wait(delays[2]);
          } finally {
            executionOrder.push(`end:${label}`);
            activeTopLevelTransactions.delete(label);
          }
        });
      };

      await expect(
        Promise.all([
          runWork('first', [20, 30, 10]),
          runWork('second', [10, 5, 40]),
          runWork('third', [5, 20, 1]),
        ])
      ).resolves.toBeDefined();

      const rows = await dataSource.query('SELECT count(*) as count FROM transaction_test');
      expect(rows[0].count).toBe(6);
      expect(maxActiveTopLevelTransactions).toBe(1);
      expect(executionOrder).toEqual([
        'start:first',
        'end:first',
        'start:second',
        'end:second',
        'start:third',
        'end:third',
      ]);
    } finally {
      await dataSource.destroy();
    }
  });

  it('does not wrap a sqlite data source more than once', async () => {
    const dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
    });

    await dataSource.initialize();

    try {
      serializeSqliteTransactions(dataSource);
      const firstWrappedTransaction = dataSource.transaction;

      serializeSqliteTransactions(dataSource);

      expect(dataSource.transaction).toBe(firstWrappedTransaction);
    } finally {
      await dataSource.destroy();
    }
  });

  it('preserves the isolation-level transaction overload', async () => {
    const dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
    });

    await dataSource.initialize();
    serializeSqliteTransactions(dataSource);

    try {
      await dataSource.query('CREATE TABLE isolation_test (id integer primary key, label text)');

      await dataSource.transaction('SERIALIZABLE', async manager => {
        await manager.query('INSERT INTO isolation_test(label) VALUES (?)', ['serialized']);
      });

      const rows = await dataSource.query('SELECT label FROM isolation_test');
      expect(rows).toEqual([{ label: 'serialized' }]);
    } finally {
      await dataSource.destroy();
    }
  });

  it('does not wrap non-sqlite data sources', async () => {
    const transaction = jest.fn(async (callback: (manager: EntityManager) => Promise<void>) => {
      await callback({} as EntityManager);
    });
    const dataSource = {
      options: { type: 'mysql' },
      transaction,
    } as unknown as DataSource;

    serializeSqliteTransactions(dataSource);

    expect(dataSource.transaction).toBe(transaction);
  });
});
