import { SnowflakeSourceDataLastUpdatedResolver } from './snowflake-source-data-last-updated.resolver';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorage } from '../../../entities/data-storage.entity';

/** EXPLAIN USING JSON shape: operations grouped per step, each with its scanned objects. */
const explainPlan = (...objects: string[][]) => ({
  GlobalStats: { partitionsTotal: 0, partitionsAssigned: 0, bytesAssigned: 0 },
  Operations: [
    objects.map((objs, id) => ({
      id,
      operation: 'TableScan',
      expressions: [],
      objects: objs,
      partitionsAssigned: 0,
      partitionsTotal: 0,
      bytesAssigned: 0,
      parentOperators: [],
    })),
  ],
});

/** Epoch nanoseconds, the unit SYSTEM$LAST_CHANGE_COMMIT_TIME reports. */
const NANOS_AUG_1 = Date.parse('2026-08-01T10:00:00.000Z') * 1_000_000;
const NANOS_AUG_5 = Date.parse('2026-08-05T08:30:00.000Z') * 1_000_000;

describe('SnowflakeSourceDataLastUpdatedResolver', () => {
  const storage = {
    id: 'storage-1',
    type: DataStorageType.SNOWFLAKE,
    config: { account: 'org-acct', warehouse: 'wh' },
  } as unknown as DataStorage;

  const createResolver = (adapter: Record<string, jest.Mock>) => {
    const withDestroy = { destroy: jest.fn().mockResolvedValue(undefined), ...adapter };
    const adapterFactory = { createFromStorage: jest.fn().mockResolvedValue(withDestroy) };
    return {
      resolver: new SnowflakeSourceDataLastUpdatedResolver(adapterFactory as never),
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

  /** The healthy default: two tables, both with commit times. */
  const adapterWith = (overrides: Record<string, jest.Mock> = {}) => ({
    executeDryRunQuery: jest
      .fn()
      .mockResolvedValue(explainPlan(['DEV.DLU.ORDERS'], ['DEV.DLU.CUSTOMERS'])),
    executeQueryAndFetchAll: jest.fn().mockResolvedValue([
      { SOURCE_TABLE: 'DEV.DLU.ORDERS', LAST_CHANGE: NANOS_AUG_1 },
      { SOURCE_TABLE: 'DEV.DLU.CUSTOMERS', LAST_CHANGE: NANOS_AUG_5 },
    ]),
    ...overrides,
  });

  it('reports the newest change commit time across all scanned tables', async () => {
    const result = await run(adapterWith());

    expect(result.dataLastUpdatedAt).toBe('2026-08-05T08:30:00.000Z');
    expect(result.coverage).toBe('complete');
    expect(result.sources.map(s => s.table)).toEqual(['DEV.DLU.ORDERS', 'DEV.DLU.CUSTOMERS']);
  });

  it('measures all tables of one lookup in a single query with quoted identifiers', async () => {
    const adapter = adapterWith();
    await run(adapter);

    expect(adapter.executeQueryAndFetchAll).toHaveBeenCalledTimes(1);
    const sql = adapter.executeQueryAndFetchAll.mock.calls[0][0] as string;
    expect(sql).toContain(`SYSTEM$LAST_CHANGE_COMMIT_TIME('"DEV"."DLU"."ORDERS"')`);
    expect(sql).toContain(`SYSTEM$LAST_CHANGE_COMMIT_TIME('"DEV"."DLU"."CUSTOMERS"')`);
    expect(sql).toContain('UNION ALL');
  });

  it('accepts commit times handed over as strings', async () => {
    const result = await run(
      adapterWith({
        executeDryRunQuery: jest.fn().mockResolvedValue(explainPlan(['DEV.DLU.ORDERS'])),
        executeQueryAndFetchAll: jest
          .fn()
          .mockResolvedValue([
            { SOURCE_TABLE: 'DEV.DLU.ORDERS', LAST_CHANGE: String(NANOS_AUG_1) },
          ]),
      })
    );

    expect(result.dataLastUpdatedAt).toBe('2026-08-01T10:00:00.000Z');
    expect(result.coverage).toBe('complete');
  });

  it('reports a table with no recorded changes as a null source with a note', async () => {
    const result = await run(
      adapterWith({
        executeDryRunQuery: jest.fn().mockResolvedValue(explainPlan(['DEV.DLU.FRESH_TABLE'])),
        executeQueryAndFetchAll: jest
          .fn()
          .mockResolvedValue([{ SOURCE_TABLE: 'DEV.DLU.FRESH_TABLE', LAST_CHANGE: 0 }]),
      })
    );

    expect(result).toMatchObject({ dataLastUpdatedAt: null, coverage: 'unavailable' });
    expect(result.sources[0]).toMatchObject({
      table: 'DEV.DLU.FRESH_TABLE',
      dataLastUpdatedAt: null,
      note: 'no data changes recorded',
    });
  });

  it('flags an unrecognised commit time value distinctly from an unchanged table', async () => {
    const result = await run(
      adapterWith({
        executeDryRunQuery: jest.fn().mockResolvedValue(explainPlan(['DEV.DLU.ORDERS'])),
        executeQueryAndFetchAll: jest
          .fn()
          .mockResolvedValue([{ SOURCE_TABLE: 'DEV.DLU.ORDERS', LAST_CHANGE: 'not-a-number' }]),
      })
    );

    expect(result.sources[0]).toMatchObject({
      table: 'DEV.DLU.ORDERS',
      dataLastUpdatedAt: null,
      note: 'unrecognised change commit time value',
    });
  });

  it('falls back to per-table queries when the batched query fails', async () => {
    const executeQueryAndFetchAll = jest.fn(async (sql: string) => {
      if (sql.includes('UNION ALL')) throw new Error('Object does not exist: BROKEN');
      if (sql.includes('"BROKEN"')) throw new Error('Object does not exist: BROKEN');
      return [{ SOURCE_TABLE: 'DEV.DLU.ORDERS', LAST_CHANGE: NANOS_AUG_1 }];
    });
    const result = await run(
      adapterWith({
        executeDryRunQuery: jest
          .fn()
          .mockResolvedValue(explainPlan(['DEV.DLU.ORDERS'], ['DEV.DLU.BROKEN'])),
        executeQueryAndFetchAll,
      })
    );

    // One broken table degrades itself, not its neighbours.
    expect(result.dataLastUpdatedAt).toBe('2026-08-01T10:00:00.000Z');
    expect(result.coverage).toBe('partial');
    expect(result.sources).toContainEqual(
      expect.objectContaining({
        table: 'DEV.DLU.BROKEN',
        dataLastUpdatedAt: null,
        note: 'could not read change commit time',
      })
    );
    // Batched attempt first, then one retry per table.
    expect(executeQueryAndFetchAll).toHaveBeenCalledTimes(3);
  });

  it('reports unavailable when the plan contains no scanned objects', async () => {
    const result = await run(
      adapterWith({
        executeDryRunQuery: jest.fn().mockResolvedValue(explainPlan()),
      })
    );

    expect(result).toMatchObject({ dataLastUpdatedAt: null, coverage: 'unavailable', sources: [] });
  });

  it('keeps measuring the batch when one item fails its EXPLAIN', async () => {
    const { resolver } = createResolver(
      adapterWith({
        executeDryRunQuery: jest.fn(async (sql: string) => {
          if (sql.includes('broken')) throw new Error('SQL compilation error');
          return explainPlan(['DEV.DLU.ORDERS']);
        }),
        executeQueryAndFetchAll: jest
          .fn()
          .mockResolvedValue([{ SOURCE_TABLE: 'DEV.DLU.ORDERS', LAST_CHANGE: NANOS_AUG_1 }]),
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
    expect(results.get('dm-ok')?.dataLastUpdatedAt).toBe('2026-08-01T10:00:00.000Z');
  });

  it('measures each table once per batch, not once per item', async () => {
    const adapter = adapterWith({
      executeDryRunQuery: jest.fn().mockResolvedValue(explainPlan(['DEV.DLU.ORDERS'])),
      executeQueryAndFetchAll: jest
        .fn()
        .mockResolvedValue([{ SOURCE_TABLE: 'DEV.DLU.ORDERS', LAST_CHANGE: NANOS_AUG_1 }]),
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
    expect(results.get('dm-2')?.dataLastUpdatedAt).toBe('2026-08-01T10:00:00.000Z');
    // The expensive per-table lookup ran once for the whole sweep.
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
        executeDryRunQuery: jest.fn().mockRejectedValue(new Error('SQL compilation error')),
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
        return explainPlan(['DEV.DLU.ORDERS']);
      }),
      executeQueryAndFetchAll: jest
        .fn()
        .mockResolvedValue([{ SOURCE_TABLE: 'DEV.DLU.ORDERS', LAST_CHANGE: NANOS_AUG_1 }]),
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

  it('resolves nothing for a storage whose config is not a Snowflake config', async () => {
    const adapter = adapterWith();
    const { resolver } = createResolver(adapter);

    const results = await resolver.resolveForSqlBatch({
      storage: { ...storage, config: { region: 'not-snowflake' } } as unknown as DataStorage,
      items: [{ key: SINGLE, sql: 'SELECT 1' }],
    });

    expect(results.size).toBe(0);
    expect(adapter.executeDryRunQuery).not.toHaveBeenCalled();
  });
});
