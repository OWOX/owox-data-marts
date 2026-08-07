import { AsyncLocalStorage } from 'node:async_hooks';
import { DataSource, EntityManager } from 'typeorm';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';

const SQLITE_TRANSACTION_SERIALIZER = Symbol('SQLITE_TRANSACTION_SERIALIZER');
const transactionOwner = new AsyncLocalStorage<AsyncTransactionQueue>();
const queuesByDatabase = new Map<string, AsyncTransactionQueue>();

type RunInTransaction<T> = (entityManager: EntityManager) => Promise<T>;
type TransactionMethod = DataSource['transaction'];
type SerializableDataSource = DataSource & {
  [SQLITE_TRANSACTION_SERIALIZER]?: true;
  transaction: TransactionMethod;
};

class AsyncTransactionQueue {
  private tail: Promise<void> = Promise.resolve();

  async run<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>(resolve => {
      release = resolve;
    });

    await previous.catch(() => undefined);

    try {
      return await operation();
    } finally {
      release();
    }
  }
}

export function serializeSqliteTransactions(dataSource: DataSource): DataSource {
  if (dataSource.options.type !== 'better-sqlite3') {
    return dataSource;
  }

  const serializableDataSource = dataSource as SerializableDataSource;
  if (serializableDataSource[SQLITE_TRANSACTION_SERIALIZER]) {
    return dataSource;
  }

  const databaseKey = String(dataSource.options.database);
  const queue = queuesByDatabase.get(databaseKey) ?? new AsyncTransactionQueue();
  queuesByDatabase.set(databaseKey, queue);
  const originalTransaction = serializableDataSource.transaction.bind(
    dataSource
  ) as TransactionMethod;

  const runOriginalTransaction = <T>(
    isolationOrRunInTransaction: IsolationLevel | RunInTransaction<T>,
    runInTransaction?: RunInTransaction<T>
  ): Promise<T> => {
    if (typeof isolationOrRunInTransaction === 'function') {
      return originalTransaction(isolationOrRunInTransaction);
    }

    return originalTransaction(isolationOrRunInTransaction, runInTransaction!);
  };

  serializableDataSource.transaction = async <T>(
    isolationOrRunInTransaction: IsolationLevel | RunInTransaction<T>,
    runInTransaction?: RunInTransaction<T>
  ): Promise<T> => {
    if (transactionOwner.getStore() === queue) {
      return runOriginalTransaction(isolationOrRunInTransaction, runInTransaction);
    }

    return queue.run(() =>
      transactionOwner.run(queue, () =>
        runOriginalTransaction(isolationOrRunInTransaction, runInTransaction)
      )
    );
  };
  serializableDataSource[SQLITE_TRANSACTION_SERIALIZER] = true;

  return dataSource;
}
