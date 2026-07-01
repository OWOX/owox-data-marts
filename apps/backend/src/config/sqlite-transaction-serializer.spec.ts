import 'reflect-metadata';
import { DataSource, EntityManager } from 'typeorm';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';
import {
  addTransactionalDataSource,
  deleteDataSourceByName,
  initializeTransactionalContext,
  StorageDriver,
  Transactional,
} from 'typeorm-transactional';
import { serializeSqliteTransactions } from './sqlite-transaction-serializer';

describe('serializeSqliteTransactions', () => {
  type TransactionCallback<T> = (manager: EntityManager) => Promise<T>;
  type TransactionMock = jest.MockedFunction<
    <T>(
      isolationOrRunInTransaction: IsolationLevel | TransactionCallback<T>,
      runInTransaction?: TransactionCallback<T>
    ) => Promise<T>
  >;

  const createDataSource = (type: DataSource['options']['type']): DataSource => {
    const manager = {} as EntityManager;
    const transaction: TransactionMock = jest.fn(
      async <T>(
        isolationOrRunInTransaction: IsolationLevel | TransactionCallback<T>,
        runInTransaction?: TransactionCallback<T>
      ): Promise<T> => {
        const callback =
          typeof isolationOrRunInTransaction === 'function'
            ? isolationOrRunInTransaction
            : runInTransaction!;

        return callback(manager);
      }
    );

    return {
      options: { type },
      transaction,
    } as unknown as DataSource;
  };

  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  beforeAll(() => {
    initializeTransactionalContext({ storageDriver: StorageDriver.AUTO });
  });

  it('serializes concurrent better-sqlite3 transactions while preserving nested transactions', async () => {
    const dataSource = createDataSource('better-sqlite3');
    serializeSqliteTransactions(dataSource);

    const activeTopLevelTransactions = new Set<string>();
    const executionOrder: string[] = [];
    let maxActiveTopLevelTransactions = 0;

    const runWork = async (label: string, delays: [number, number, number]) => {
      await dataSource.transaction(async () => {
        activeTopLevelTransactions.add(label);
        executionOrder.push(`start:${label}`);
        maxActiveTopLevelTransactions = Math.max(
          maxActiveTopLevelTransactions,
          activeTopLevelTransactions.size
        );

        try {
          await wait(delays[0]);

          await dataSource.transaction(async () => {
            executionOrder.push(`nested:${label}`);
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

    expect(maxActiveTopLevelTransactions).toBe(1);
    expect(executionOrder).toEqual([
      'start:first',
      'nested:first',
      'end:first',
      'start:second',
      'nested:second',
      'end:second',
      'start:third',
      'nested:third',
      'end:third',
    ]);
  });

  it('continues queued transactions after a transaction rejects', async () => {
    const dataSource = createDataSource('better-sqlite3');
    serializeSqliteTransactions(dataSource);

    const firstError = new Error('first transaction failed');
    const executionOrder: string[] = [];

    const first = dataSource.transaction(async () => {
      executionOrder.push('start:first');
      throw firstError;
    });
    const second = dataSource.transaction(async () => {
      executionOrder.push('start:second');
      return 'second result';
    });

    const [firstResult, secondResult] = await Promise.allSettled([first, second]);

    expect(firstResult.status).toBe('rejected');
    if (firstResult.status === 'rejected') {
      expect(firstResult.reason).toBe(firstError);
    }
    expect(secondResult).toEqual({
      status: 'fulfilled',
      value: 'second result',
    });
    expect(executionOrder).toEqual(['start:first', 'start:second']);
  });

  it('serializes @Transactional methods through the registered sqlite data source', async () => {
    const dataSource = createDataSource('better-sqlite3');
    const connectionName = 'sqlite-transaction-serializer-decorator-test';
    serializeSqliteTransactions(
      addTransactionalDataSource({
        name: connectionName,
        dataSource,
        patch: false,
      })
    );

    const activeTransactions = new Set<string>();
    const executionOrder: string[] = [];
    let maxActiveTransactions = 0;

    class ScheduledTransactionFlow {
      @Transactional({ connectionName })
      async process(label: string, delay: number): Promise<void> {
        activeTransactions.add(label);
        executionOrder.push(`start:${label}`);
        maxActiveTransactions = Math.max(maxActiveTransactions, activeTransactions.size);

        try {
          await wait(delay);
        } finally {
          executionOrder.push(`end:${label}`);
          activeTransactions.delete(label);
        }
      }
    }

    try {
      const flow = new ScheduledTransactionFlow();

      await Promise.all([flow.process('first', 20), flow.process('second', 1)]);

      expect(maxActiveTransactions).toBe(1);
      expect(executionOrder).toEqual(['start:first', 'end:first', 'start:second', 'end:second']);
    } finally {
      deleteDataSourceByName(connectionName);
    }
  });

  it('does not wrap a sqlite data source more than once', async () => {
    const dataSource = createDataSource('better-sqlite3');

    serializeSqliteTransactions(dataSource);
    const firstWrappedTransaction = dataSource.transaction;

    serializeSqliteTransactions(dataSource);

    expect(dataSource.transaction).toBe(firstWrappedTransaction);
  });

  it('preserves the isolation-level transaction overload', async () => {
    const dataSource = createDataSource('better-sqlite3');
    const originalTransaction = dataSource.transaction as TransactionMock;
    serializeSqliteTransactions(dataSource);

    const result = await dataSource.transaction('SERIALIZABLE', async () => 'serialized');

    expect(result).toBe('serialized');
    expect(originalTransaction).toHaveBeenCalledWith('SERIALIZABLE', expect.any(Function));
  });

  it('does not wrap non-sqlite data sources', async () => {
    const dataSource = createDataSource('mysql');
    const transaction = dataSource.transaction;

    serializeSqliteTransactions(dataSource);

    expect(dataSource.transaction).toBe(transaction);
  });
});
