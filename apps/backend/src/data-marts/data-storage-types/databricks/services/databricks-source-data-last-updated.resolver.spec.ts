import { DatabricksSourceDataLastUpdatedResolver } from './databricks-source-data-last-updated.resolver';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorage } from '../../../entities/data-storage.entity';

const explainWith = (...tables: string[]) => ({
  isValid: true,
  plan: [
    '== Analyzed Logical Plan ==',
    ...tables.map(table => `+- Relation ${table}[id#1] parquet`),
  ].join('\n'),
});

const historyRow = (operation: string, committedAt: string | null) => ({
  OPERATION: operation,
  COMMITTED_AT: committedAt,
});

const T_AUG_1 = '2026-08-01T10:00:00.000Z';
const T_AUG_5 = '2026-08-05T08:30:00.000Z';

describe('DatabricksSourceDataLastUpdatedResolver', () => {
  const storage = {
    id: 'storage-1',
    type: DataStorageType.DATABRICKS,
    config: { host: 'adb.example.com', httpPath: '/sql/1.0/warehouses/abc' },
  } as unknown as DataStorage;

  const createResolver = (adapter: Record<string, jest.Mock>) => {
    const withDestroy = { destroy: jest.fn().mockResolvedValue(undefined), ...adapter };
    const adapterFactory = { createFromStorage: jest.fn().mockResolvedValue(withDestroy) };
    return {
      resolver: new DatabricksSourceDataLastUpdatedResolver(adapterFactory as never),
      adapter: withDestroy,
    };
  };

  const SINGLE = 'dm-1';

  /** Batch-of-one: the shape every single-lookup caller goes through. */
  const run = async (adapter: Record<string, jest.Mock>, sql = 'SELECT 1') => {
    const results = await createResolver(adapter).resolver.resolveForSqlBatch({
      storage,
      items: [{ key: SINGLE, sql }],
    });
    return results.get(SINGLE)!;
  };

  /** The healthy default: two Delta tables, each with a WRITE on top of its history. */
  const adapterWith = (overrides: Record<string, jest.Mock> = {}) => ({
    executeDryRunQuery: jest
      .fn()
      .mockResolvedValue(explainWith('main.dlu.orders', 'main.dlu.customers')),
    executeQueryAndFetchAll: jest.fn(async (sql: string) => {
      if (sql.includes('`orders`')) return [historyRow('WRITE', T_AUG_1)];
      if (sql.includes('`customers`')) return [historyRow('MERGE', T_AUG_5)];
      return [];
    }),
    ...overrides,
  });

  it('reports the newest data-changing commit across all scanned tables', async () => {
    const result = await run(adapterWith());

    expect(result.dataLastUpdatedAt).toBe(T_AUG_5);
    expect(result.coverage).toBe('complete');
    expect(result.sources.map(s => s.table)).toEqual(['main.dlu.orders', 'main.dlu.customers']);
  });

  it('reads history through an escaped identifier with a bounded LIMIT', async () => {
    const adapter = adapterWith({
      executeDryRunQuery: jest.fn().mockResolvedValue(explainWith('main.dlu.orders')),
      executeQueryAndFetchAll: jest.fn().mockResolvedValue([historyRow('WRITE', T_AUG_1)]),
    });
    await run(adapter);

    const sql = adapter.executeQueryAndFetchAll.mock.calls[0][0] as string;
    expect(sql).toContain('DESCRIBE HISTORY `main`.`dlu`.`orders` LIMIT 100');
    expect(sql).toContain('to_utc_timestamp');
  });

  it('skips maintenance commits on top of the history and finds the older write', async () => {
    const result = await run(
      adapterWith({
        executeDryRunQuery: jest.fn().mockResolvedValue(explainWith('main.dlu.orders')),
        executeQueryAndFetchAll: jest
          .fn()
          .mockResolvedValue([
            historyRow('OPTIMIZE', '2026-08-10T00:00:00.000Z'),
            historyRow('VACUUM END', '2026-08-09T00:00:00.000Z'),
            historyRow('WRITE', T_AUG_1),
          ]),
      })
    );

    // The OPTIMIZE from Aug 10 must NOT become the answer — data last changed Aug 1.
    expect(result.dataLastUpdatedAt).toBe(T_AUG_1);
    expect(result.coverage).toBe('complete');
  });

  it('reports a table with only maintenance commits as unknown with a note', async () => {
    const result = await run(
      adapterWith({
        executeDryRunQuery: jest.fn().mockResolvedValue(explainWith('main.dlu.orders')),
        executeQueryAndFetchAll: jest
          .fn()
          .mockResolvedValue([historyRow('OPTIMIZE', '2026-08-10T00:00:00.000Z')]),
      })
    );

    expect(result).toMatchObject({ dataLastUpdatedAt: null, coverage: 'unavailable' });
    expect(result.sources[0]).toMatchObject({
      table: 'main.dlu.orders',
      dataLastUpdatedAt: null,
      note: 'no data changes in the recent table history',
    });
  });

  it('keeps the answer when one table has no history, flagged as partial', async () => {
    const result = await run(
      adapterWith({
        executeDryRunQuery: jest
          .fn()
          .mockResolvedValue(explainWith('main.dlu.orders', 'main.dlu.csv_external')),
        executeQueryAndFetchAll: jest.fn(async (sql: string) => {
          if (sql.includes('`csv_external`')) {
            throw new Error('Table history is only supported for Delta tables.');
          }
          return [historyRow('WRITE', T_AUG_1)];
        }),
      })
    );

    expect(result.dataLastUpdatedAt).toBe(T_AUG_1);
    expect(result.coverage).toBe('partial');
    expect(result.sources).toContainEqual(
      expect.objectContaining({
        table: 'main.dlu.csv_external',
        dataLastUpdatedAt: null,
        note: 'could not read table history',
      })
    );
  });

  it('flags an unrecognised history timestamp distinctly from an unchanged table', async () => {
    const result = await run(
      adapterWith({
        executeDryRunQuery: jest.fn().mockResolvedValue(explainWith('main.dlu.orders')),
        executeQueryAndFetchAll: jest
          .fn()
          .mockResolvedValue([historyRow('WRITE', 'not-a-timestamp')]),
      })
    );

    expect(result.sources[0]).toMatchObject({
      table: 'main.dlu.orders',
      dataLastUpdatedAt: null,
      note: 'unrecognised table history value',
    });
  });

  it('reports unavailable when the plan contains no relations', async () => {
    const result = await run(
      adapterWith({
        executeDryRunQuery: jest
          .fn()
          .mockResolvedValue({ isValid: true, plan: '== Physical Plan ==\nLocalTableScan' }),
      })
    );

    expect(result).toMatchObject({ dataLastUpdatedAt: null, coverage: 'unavailable', sources: [] });
  });

  it('keeps measuring the batch when one item fails its EXPLAIN', async () => {
    const { resolver } = createResolver(
      adapterWith({
        executeDryRunQuery: jest.fn(async (sql: string) => {
          if (sql.includes('broken')) {
            return { isValid: false, plan: '', error: 'TABLE_OR_VIEW_NOT_FOUND' };
          }
          return explainWith('main.dlu.orders');
        }),
        executeQueryAndFetchAll: jest.fn().mockResolvedValue([historyRow('WRITE', T_AUG_1)]),
      })
    );

    const results = await resolver.resolveForSqlBatch({
      storage,
      items: [
        { key: 'dm-broken', sql: 'SELECT * FROM broken' },
        { key: 'dm-ok', sql: 'SELECT * FROM orders' },
      ],
    });

    // The broken item's key is simply absent ("no new information"); the healthy one resolves.
    expect(results.has('dm-broken')).toBe(false);
    expect(results.get('dm-ok')?.dataLastUpdatedAt).toBe(T_AUG_1);
  });

  it('reads each table history once per batch, not once per item', async () => {
    const adapter = adapterWith({
      executeDryRunQuery: jest.fn().mockResolvedValue(explainWith('main.dlu.orders')),
      executeQueryAndFetchAll: jest.fn().mockResolvedValue([historyRow('WRITE', T_AUG_1)]),
    });
    const { resolver } = createResolver(adapter);

    const results = await resolver.resolveForSqlBatch({
      storage,
      items: [
        { key: 'dm-1', sql: 'SELECT * FROM orders' },
        { key: 'dm-2', sql: 'SELECT id FROM orders' },
      ],
    });

    expect(results.size).toBe(2);
    expect(results.get('dm-2')?.dataLastUpdatedAt).toBe(T_AUG_1);
    expect(adapter.executeQueryAndFetchAll).toHaveBeenCalledTimes(1);
  });

  it('destroys the connection when the batch completes', async () => {
    const { resolver, adapter } = createResolver(adapterWith());

    await resolver.resolveForSqlBatch({ storage, items: [{ key: SINGLE, sql: 'SELECT 1' }] });

    expect(adapter.destroy).toHaveBeenCalledTimes(1);
  });

  it('destroys the connection even when an item throws', async () => {
    const { resolver, adapter } = createResolver(
      adapterWith({
        executeDryRunQuery: jest.fn().mockRejectedValue(new Error('connection lost')),
      })
    );

    await resolver.resolveForSqlBatch({ storage, items: [{ key: SINGLE, sql: 'SELECT 1' }] });

    expect(adapter.destroy).toHaveBeenCalledTimes(1);
  });

  it('resolves nothing when the batch starts already aborted', async () => {
    const adapter = adapterWith();
    const { resolver } = createResolver(adapter);
    const controller = new AbortController();
    controller.abort();

    const results = await resolver.resolveForSqlBatch({
      storage,
      items: [{ key: SINGLE, sql: 'SELECT 1' }],
      signal: controller.signal,
    });

    expect(results.size).toBe(0);
    expect(adapter.executeDryRunQuery).not.toHaveBeenCalled();
  });

  it('stops between items once the signal aborts, keeping what already resolved', async () => {
    const controller = new AbortController();
    const adapter = adapterWith({
      executeDryRunQuery: jest.fn(async () => {
        // First item resolves normally, then the deadline fires before the second starts.
        controller.abort();
        return explainWith('main.dlu.orders');
      }),
      executeQueryAndFetchAll: jest.fn().mockResolvedValue([historyRow('WRITE', T_AUG_1)]),
    });
    const { resolver } = createResolver(adapter);

    const results = await resolver.resolveForSqlBatch({
      storage,
      items: [
        { key: 'dm-1', sql: 'SELECT * FROM orders' },
        { key: 'dm-2', sql: 'SELECT * FROM orders' },
      ],
      signal: controller.signal,
    });

    expect([...results.keys()]).toEqual(['dm-1']);
    expect(adapter.executeDryRunQuery).toHaveBeenCalledTimes(1);
  });

  it('resolves nothing for a storage whose config is not a Databricks config', async () => {
    const adapter = adapterWith();
    const { resolver } = createResolver(adapter);

    const results = await resolver.resolveForSqlBatch({
      storage: { ...storage, config: { region: 'not-databricks' } } as unknown as DataStorage,
      items: [{ key: SINGLE, sql: 'SELECT 1' }],
    });

    expect(results.size).toBe(0);
    expect(adapter.executeDryRunQuery).not.toHaveBeenCalled();
  });
});
