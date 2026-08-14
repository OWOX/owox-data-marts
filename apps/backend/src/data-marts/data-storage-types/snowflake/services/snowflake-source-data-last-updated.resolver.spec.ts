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

/** Start-of-hour ISO strings, the shape the TABLE_DML_HISTORY query renders in SQL. */
const HOUR_AUG_1 = '2026-08-01T10:00:00.000Z';
const HOUR_AUG_5 = '2026-08-05T08:00:00.000Z';

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
      { SOURCE_TABLE: 'DEV.DLU.ORDERS', TABLE_TYPE: 'BASE TABLE', LAST_DML_AT: HOUR_AUG_1 },
      { SOURCE_TABLE: 'DEV.DLU.CUSTOMERS', TABLE_TYPE: 'BASE TABLE', LAST_DML_AT: HOUR_AUG_5 },
    ]),
    ...overrides,
  });

  it('reports the newest DML window start across all scanned tables', async () => {
    const result = await run(adapterWith());

    expect(result.dataLastUpdatedAt).toBe(HOUR_AUG_5);
    expect(result.coverage).toBe('complete');
    expect(result.sources.map(s => s.table)).toEqual(['DEV.DLU.ORDERS', 'DEV.DLU.CUSTOMERS']);
  });

  it('measures all tables of one lookup in a single query over the history view', async () => {
    const adapter = adapterWith();
    await run(adapter);

    expect(adapter.executeQueryAndFetchAll).toHaveBeenCalledTimes(1);
    const sql = adapter.executeQueryAndFetchAll.mock.calls[0][0] as string;
    expect(sql).toContain('SNOWFLAKE.ACCOUNT_USAGE.TABLE_DML_HISTORY');
    expect(sql).toContain(
      `(t.TABLE_CATALOG = 'DEV' AND t.TABLE_SCHEMA = 'DLU' AND t.TABLE_NAME = 'ORDERS')`
    );
    expect(sql).toContain(
      `(t.TABLE_CATALOG = 'DEV' AND t.TABLE_SCHEMA = 'DLU' AND t.TABLE_NAME = 'CUSTOMERS')`
    );
    expect(sql).toContain('MAX(h.START_TIME)');
    expect(sql).toContain('t.IS_ICEBERG');
    // Identity, not names: history rows of a dropped-and-recreated table's old generation
    // must never answer for the current one.
    expect(sql).toContain('ON h.TABLE_ID = t.TABLE_ID');
    expect(sql).toContain('t.DELETED IS NULL');
  });

  it('reports a recreated table by its own generation, not its predecessor', async () => {
    // The active generation exists in the catalog but has no DML rows of its own; the old
    // generation's history must not leak in (the ID join guarantees it — the row arrives
    // with a null time).
    const result = await run(
      adapterWith({
        executeDryRunQuery: jest.fn().mockResolvedValue(explainPlan(['DEV.DLU.ORDERS'])),
        executeQueryAndFetchAll: jest
          .fn()
          .mockResolvedValue([
            { SOURCE_TABLE: 'DEV.DLU.ORDERS', TABLE_TYPE: 'BASE TABLE', LAST_DML_AT: null },
          ]),
      })
    );

    expect(result).toMatchObject({ dataLastUpdatedAt: null, coverage: 'unavailable' });
    expect(result.sources[0]).toMatchObject({
      table: 'DEV.DLU.ORDERS',
      dataLastUpdatedAt: null,
      note: 'no data changes recorded in the last year',
    });
  });

  it('refuses an Iceberg table even when the DML history holds a row for it', async () => {
    // Iceberg data can change outside Snowflake; a retained Snowflake-side write must not be
    // presented as THE last change with complete coverage.
    const result = await run(
      adapterWith({
        executeDryRunQuery: jest
          .fn()
          .mockResolvedValue(explainPlan(['DEV.DLU.ORDERS'], ['DEV.DLU.ICE_EVENTS'])),
        executeQueryAndFetchAll: jest.fn().mockResolvedValue([
          { SOURCE_TABLE: 'DEV.DLU.ORDERS', TABLE_TYPE: 'BASE TABLE', LAST_DML_AT: HOUR_AUG_1 },
          {
            SOURCE_TABLE: 'DEV.DLU.ICE_EVENTS',
            TABLE_TYPE: 'BASE TABLE',
            IS_ICEBERG: 'YES',
            LAST_DML_AT: HOUR_AUG_5,
          },
        ]),
      })
    );

    expect(result.dataLastUpdatedAt).toBe(HOUR_AUG_1);
    expect(result.coverage).toBe('partial');
    expect(result.sources).toContainEqual(
      expect.objectContaining({
        table: 'DEV.DLU.ICE_EVENTS',
        dataLastUpdatedAt: null,
        note: 'iceberg table — modification time not measured',
      })
    );
  });

  it('reports an unexpanded materialized view as unknown instead of fabricating a time', async () => {
    const result = await run(
      adapterWith({
        executeDryRunQuery: jest
          .fn()
          .mockResolvedValue(explainPlan(['DEV.DLU.ORDERS'], ['DEV.DLU.MV_DAILY'])),
        executeQueryAndFetchAll: jest.fn().mockResolvedValue([
          { SOURCE_TABLE: 'DEV.DLU.ORDERS', TABLE_TYPE: 'BASE TABLE', LAST_DML_AT: HOUR_AUG_1 },
          { SOURCE_TABLE: 'DEV.DLU.MV_DAILY', TABLE_TYPE: 'MATERIALIZED VIEW', LAST_DML_AT: null },
        ]),
      })
    );

    expect(result.dataLastUpdatedAt).toBe(HOUR_AUG_1);
    expect(result.coverage).toBe('partial');
    expect(result.sources).toContainEqual(
      expect.objectContaining({
        table: 'DEV.DLU.MV_DAILY',
        dataLastUpdatedAt: null,
        note: 'materialized view — modification time not measured',
      })
    );
  });

  it('reports a table missing from the account-usage catalog as unknown', async () => {
    const result = await run(
      adapterWith({
        executeDryRunQuery: jest.fn().mockResolvedValue(explainPlan(['DEV.DLU.FRESH_TABLE'])),
        // Not in ACCOUNT_USAGE.TABLES yet: newer than the catalog's publishing delay.
        executeQueryAndFetchAll: jest.fn().mockResolvedValue([]),
      })
    );

    expect(result).toMatchObject({ dataLastUpdatedAt: null, coverage: 'unavailable' });
    expect(result.sources[0]).toMatchObject({
      table: 'DEV.DLU.FRESH_TABLE',
      dataLastUpdatedAt: null,
      note: 'table not found in account usage metadata',
    });
  });

  it('marks a name it cannot split into a database.schema.table triple, without querying', async () => {
    const executeQueryAndFetchAll = jest.fn();
    const result = await run(
      adapterWith({
        executeDryRunQuery: jest.fn().mockResolvedValue(explainPlan(['"Weird.Db".DLU.ORDERS'])),
        executeQueryAndFetchAll,
      })
    );

    expect(executeQueryAndFetchAll).not.toHaveBeenCalled();
    expect(result.sources[0]).toMatchObject({
      dataLastUpdatedAt: null,
      note: 'cannot identify the source table name',
    });
  });

  it('keeps the resolved time next to an unchanged table, flagged as partial', async () => {
    const result = await run(
      adapterWith({
        executeDryRunQuery: jest
          .fn()
          .mockResolvedValue(explainPlan(['DEV.DLU.ORDERS'], ['DEV.DLU.FRESH_TABLE'])),
        executeQueryAndFetchAll: jest
          .fn()
          .mockResolvedValue([
            { SOURCE_TABLE: 'DEV.DLU.ORDERS', TABLE_TYPE: 'BASE TABLE', LAST_DML_AT: HOUR_AUG_1 },
          ]),
      })
    );

    expect(result.dataLastUpdatedAt).toBe(HOUR_AUG_1);
    expect(result.coverage).toBe('partial');
    expect(result.sources).toContainEqual(
      expect.objectContaining({ table: 'DEV.DLU.FRESH_TABLE', dataLastUpdatedAt: null })
    );
  });

  it('flags an unrecognised history value distinctly from an unchanged table', async () => {
    const result = await run(
      adapterWith({
        executeDryRunQuery: jest.fn().mockResolvedValue(explainPlan(['DEV.DLU.ORDERS'])),
        executeQueryAndFetchAll: jest.fn().mockResolvedValue([
          {
            SOURCE_TABLE: 'DEV.DLU.ORDERS',
            TABLE_TYPE: 'BASE TABLE',
            LAST_DML_AT: 'not-a-timestamp',
          },
        ]),
      })
    );

    expect(result.sources[0]).toMatchObject({
      table: 'DEV.DLU.ORDERS',
      dataLastUpdatedAt: null,
      note: 'unrecognised change history value',
    });
  });

  it('marks every asked table as unknown when the history view is unreachable', async () => {
    // The classic cause: the connection role has no access to the SNOWFLAKE database.
    const result = await run(
      adapterWith({
        executeQueryAndFetchAll: jest
          .fn()
          .mockRejectedValue(new Error("Database 'SNOWFLAKE' does not exist or not authorized")),
      })
    );

    expect(result).toMatchObject({ dataLastUpdatedAt: null, coverage: 'unavailable' });
    expect(result.sources).toHaveLength(2);
    expect(result.sources).toContainEqual(
      expect.objectContaining({
        table: 'DEV.DLU.ORDERS',
        dataLastUpdatedAt: null,
        note: 'could not read table change history',
      })
    );
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
          .mockResolvedValue([
            { SOURCE_TABLE: 'DEV.DLU.ORDERS', TABLE_TYPE: 'BASE TABLE', LAST_DML_AT: HOUR_AUG_1 },
          ]),
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
    expect(results.get('dm-ok')?.dataLastUpdatedAt).toBe(HOUR_AUG_1);
  });

  it('measures each table once per batch, not once per item', async () => {
    const adapter = adapterWith({
      executeDryRunQuery: jest.fn().mockResolvedValue(explainPlan(['DEV.DLU.ORDERS'])),
      executeQueryAndFetchAll: jest
        .fn()
        .mockResolvedValue([
          { SOURCE_TABLE: 'DEV.DLU.ORDERS', TABLE_TYPE: 'BASE TABLE', LAST_DML_AT: HOUR_AUG_1 },
        ]),
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
    expect(results.get('dm-2')?.dataLastUpdatedAt).toBe(HOUR_AUG_1);
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
        .mockResolvedValue([
          { SOURCE_TABLE: 'DEV.DLU.ORDERS', TABLE_TYPE: 'BASE TABLE', LAST_DML_AT: HOUR_AUG_1 },
        ]),
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
