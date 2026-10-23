import { SqlRunBatch } from '../../dto/domain/sql-run-batch.dto';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { SqlRunExecutorFacade } from './sql-run-executor.facade';

describe('SqlRunExecutorFacade', () => {
  it('resolves the executor by storage type, forwards every argument and yields its batches', async () => {
    const batch = new SqlRunBatch([{ id: 1 }], null, ['id']);
    const executor = {
      type: DataStorageType.DUCKDB,
      execute: jest.fn(() =>
        (async function* () {
          yield batch;
        })()
      ),
    };
    const resolver = { resolve: jest.fn().mockResolvedValue(executor) };
    const facade = new SqlRunExecutorFacade(resolver as never);
    const credentials = { token: 'c' } as never;
    const config = { path: 'x' } as never;
    const definition = { fullyQualifiedName: 'main.orders' } as never;
    const options = { maxRowsPerBatch: 10 };

    const batches: SqlRunBatch[] = [];
    for await (const b of facade.executeBatches(
      DataStorageType.DUCKDB,
      credentials,
      config,
      definition,
      'SELECT 1',
      options
    )) {
      batches.push(b);
    }

    expect(resolver.resolve).toHaveBeenCalledWith(DataStorageType.DUCKDB);
    expect(executor.execute).toHaveBeenCalledWith(
      credentials,
      config,
      definition,
      'SELECT 1',
      options
    );
    expect(batches).toEqual([batch]);
  });
});
