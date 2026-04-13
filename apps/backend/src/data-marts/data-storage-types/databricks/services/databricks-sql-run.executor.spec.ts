import { DatabricksAuthMethod } from '../enums/databricks-auth-method.enum';
import { SqlRunBatch } from '../../../dto/domain/sql-run-batch.dto';
import { DatabricksSqlRunExecutor } from './databricks-sql-run.executor';

describe('DatabricksSqlRunExecutor', () => {
  const credentials = {
    authMethod: DatabricksAuthMethod.PERSONAL_ACCESS_TOKEN,
    token: 'token',
  };
  const config = {
    host: 'host',
    httpPath: '/sql/warehouse',
  };

  it('streams rows in batches without loading all rows at once', async () => {
    const cursor = {
      queryId: 'query-1',
      fetchChunk: jest
        .fn()
        .mockResolvedValueOnce([
          { col_a: 1, col_b: 'x' },
          { col_a: 2, col_b: 'y' },
        ])
        .mockResolvedValueOnce([{ col_a: 3, col_b: 'z' }]),
      hasMoreRows: jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
      getColumns: jest.fn().mockResolvedValue(['COL_A', 'COL_B']),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const adapter = {
      openQueryCursor: jest.fn().mockResolvedValue(cursor),
      destroy: jest.fn().mockResolvedValue(undefined),
    };
    const adapterFactory = {
      create: jest.fn().mockReturnValue(adapter),
    };
    const queryBuilder = {
      buildQuery: jest.fn().mockReturnValue('SELECT 1'),
    };
    const executor = new DatabricksSqlRunExecutor(adapterFactory as never, queryBuilder as never);

    const batches: SqlRunBatch<Record<string, unknown>>[] = [];
    for await (const batch of executor.execute(
      credentials as never,
      config as never,
      {} as never,
      'SELECT * FROM test_table',
      { maxRowsPerBatch: 2 }
    )) {
      batches.push(batch);
    }

    expect(adapter.openQueryCursor).toHaveBeenCalledWith('SELECT * FROM test_table');
    expect(cursor.fetchChunk).toHaveBeenNthCalledWith(1, 2);
    expect(cursor.fetchChunk).toHaveBeenNthCalledWith(2, 2);

    expect(batches).toHaveLength(2);
    expect(batches[0].rows).toEqual([
      { col_a: 1, col_b: 'x' },
      { col_a: 2, col_b: 'y' },
    ]);
    expect(batches[0].nextBatchId).toBe('2');
    expect(batches[0].columns).toEqual(['col_a', 'col_b']);

    expect(batches[1].rows).toEqual([{ col_a: 3, col_b: 'z' }]);
    expect(batches[1].nextBatchId).toBeNull();
    expect(batches[1].columns).toEqual(['col_a', 'col_b']);

    expect(cursor.close).toHaveBeenCalledTimes(1);
    expect(adapter.destroy).toHaveBeenCalledTimes(1);
  });

  it('emits a single empty batch when query returns no rows', async () => {
    const cursor = {
      queryId: 'query-2',
      fetchChunk: jest.fn().mockResolvedValue([]),
      hasMoreRows: jest.fn(),
      getColumns: jest.fn().mockResolvedValue(['col_a']),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const adapter = {
      openQueryCursor: jest.fn().mockResolvedValue(cursor),
      destroy: jest.fn().mockResolvedValue(undefined),
    };
    const adapterFactory = {
      create: jest.fn().mockReturnValue(adapter),
    };
    const queryBuilder = {
      buildQuery: jest.fn().mockReturnValue('SELECT * FROM generated_table'),
    };
    const executor = new DatabricksSqlRunExecutor(adapterFactory as never, queryBuilder as never);

    const batches: SqlRunBatch<Record<string, unknown>>[] = [];
    for await (const batch of executor.execute(
      credentials as never,
      config as never,
      {} as never,
      undefined,
      { maxRowsPerBatch: 3 }
    )) {
      batches.push(batch);
    }

    expect(queryBuilder.buildQuery).toHaveBeenCalledTimes(1);
    expect(adapter.openQueryCursor).toHaveBeenCalledWith('SELECT * FROM generated_table');
    expect(cursor.hasMoreRows).not.toHaveBeenCalled();

    expect(batches).toHaveLength(1);
    expect(batches[0].rows).toEqual([]);
    expect(batches[0].nextBatchId).toBeNull();
    expect(batches[0].columns).toEqual(['col_a']);

    expect(cursor.close).toHaveBeenCalledTimes(1);
    expect(adapter.destroy).toHaveBeenCalledTimes(1);
  });

  it('preserves execution error when cursor close also fails', async () => {
    const cursor = {
      queryId: 'query-3',
      fetchChunk: jest.fn().mockRejectedValue(new Error('fetch failed')),
      hasMoreRows: jest.fn(),
      getColumns: jest.fn().mockResolvedValue(['col_a']),
      close: jest.fn().mockRejectedValue(new Error('close failed')),
    };
    const adapter = {
      openQueryCursor: jest.fn().mockResolvedValue(cursor),
      destroy: jest.fn().mockResolvedValue(undefined),
    };
    const adapterFactory = {
      create: jest.fn().mockReturnValue(adapter),
    };
    const queryBuilder = {
      buildQuery: jest.fn().mockReturnValue('SELECT 1'),
    };
    const executor = new DatabricksSqlRunExecutor(adapterFactory as never, queryBuilder as never);

    const consume = async () => {
      for await (const _batch of executor.execute(
        credentials as never,
        config as never,
        {} as never,
        'SELECT * FROM broken_table',
        { maxRowsPerBatch: 2 }
      )) {
        // no-op
      }
    };

    await expect(consume()).rejects.toThrow('fetch failed');
    expect(cursor.close).toHaveBeenCalledTimes(1);
    expect(adapter.destroy).toHaveBeenCalledTimes(1);
  });
});
