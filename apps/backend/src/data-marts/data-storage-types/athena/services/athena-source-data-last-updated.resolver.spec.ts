import { AthenaSourceDataLastUpdatedResolver } from './athena-source-data-last-updated.resolver';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorage } from '../../../entities/data-storage.entity';

const ioPlan = (...tables: Array<{ schema: string; table: string; catalog?: string }>) =>
  JSON.stringify({
    inputTableColumnInfos: tables.map(t => ({
      table: {
        catalog: t.catalog ?? 'awsdatacatalog',
        schemaTable: { schema: t.schema, table: t.table },
      },
    })),
  });

const ICEBERG_META = {
  tableType: 'EXTERNAL_TABLE',
  createTime: new Date('2026-01-01T00:00:00.000Z'),
  parameters: { table_type: 'ICEBERG' },
};

const hiveMeta = (ddlEpochSeconds?: number) => ({
  tableType: 'EXTERNAL_TABLE',
  createTime: new Date('2026-01-01T00:00:00.000Z'),
  parameters: ddlEpochSeconds ? { transient_lastDdlTime: String(ddlEpochSeconds) } : {},
});

describe('AthenaSourceDataLastUpdatedResolver', () => {
  const storage = {
    id: 'storage-1',
    type: DataStorageType.AWS_ATHENA,
    config: { region: 'us-east-1', outputBucket: 'results-bucket' },
  } as unknown as DataStorage;

  const createResolver = (adapter: Record<string, jest.Mock>) => {
    const adapterFactory = { createFromStorage: jest.fn().mockResolvedValue(adapter) };
    return {
      resolver: new AthenaSourceDataLastUpdatedResolver(adapterFactory as never),
      adapter,
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

  /** The healthy default: two Iceberg tables, both with snapshots. */
  const adapterWith = (overrides: Record<string, jest.Mock> = {}) => ({
    getQueryIoPlan: jest
      .fn()
      .mockResolvedValue(
        ioPlan({ schema: 'dlu', table: 'orders' }, { schema: 'dlu', table: 'customers' })
      ),
    getTableMetadata: jest.fn().mockResolvedValue(ICEBERG_META),
    executeQueryAndGetRows: jest.fn().mockResolvedValue([
      ['dlu.orders', '2026-08-01 10:00:00.000 UTC'],
      ['dlu.customers', '2026-08-05 08:30:00.000 UTC'],
    ]),
    ...overrides,
  });

  it('reports the newest commit time across Iceberg tables as complete coverage', async () => {
    const result = await run(adapterWith());

    expect(result.dataLastUpdatedAt).toBe('2026-08-05T08:30:00.000Z');
    expect(result.coverage).toBe('complete');
    expect(result.sources.map(s => s.table)).toEqual(['dlu.orders', 'dlu.customers']);
  });

  it('measures all Iceberg tables of one lookup in a single query', async () => {
    const adapter = adapterWith();
    await run(adapter);

    expect(adapter.executeQueryAndGetRows).toHaveBeenCalledTimes(1);
    const sql = adapter.executeQueryAndGetRows.mock.calls[0][0] as string;
    expect(sql).toContain('"dlu"."orders$snapshots"');
    expect(sql).toContain('"dlu"."customers$snapshots"');
    expect(sql).toContain('UNION ALL');
  });

  it('declares Hive tables unknown instead of reporting a catalog metadata time', async () => {
    const result = await run(
      adapterWith({
        getQueryIoPlan: jest.fn().mockResolvedValue(ioPlan({ schema: 'dlu', table: 'hive_t' })),
        // The catalog HAS metadata times — but a DDL-only touch moves them with no data
        // written, so reporting one would violate the "at least as recent as" contract.
        getTableMetadata: jest.fn().mockResolvedValue(hiveMeta(1770000000)),
        executeQueryAndGetRows: jest.fn(),
      })
    );

    expect(result).toMatchObject({ dataLastUpdatedAt: null, coverage: 'unavailable' });
    expect(result.sources[0]).toMatchObject({
      table: 'dlu.hive_t',
      dataLastUpdatedAt: null,
      note: 'Hive table — the catalog does not track data modification time',
    });
  });

  it('keeps the Iceberg answer next to an unknown Hive source, flagged as partial', async () => {
    const result = await run(
      adapterWith({
        getQueryIoPlan: jest
          .fn()
          .mockResolvedValue(
            ioPlan({ schema: 'dlu', table: 'orders' }, { schema: 'dlu', table: 'hive_t' })
          ),
        getTableMetadata: jest.fn(async (_c: string, _d: string, table: string) =>
          table === 'hive_t' ? hiveMeta(1770000000) : ICEBERG_META
        ),
        executeQueryAndGetRows: jest
          .fn()
          .mockResolvedValue([['dlu.orders', '2026-08-01 10:00:00.000 UTC']]),
      })
    );

    expect(result.dataLastUpdatedAt).toBe('2026-08-01T10:00:00.000Z');
    expect(result.coverage).toBe('partial');
    expect(result.sources).toContainEqual(
      expect.objectContaining({ table: 'dlu.hive_t', dataLastUpdatedAt: null })
    );
  });

  it('treats engine-internal awsdatacatalog$<connector> handles as the default catalog', async () => {
    // The live engine does not print the canonical catalog name in IO plans: an Iceberg table
    // arrives as `awsdatacatalog$iceberg-aws`. That must not be mistaken for a federated
    // catalog, and the catalog API must be called with the canonical name.
    const getTableMetadata = jest.fn().mockResolvedValue(ICEBERG_META);
    const result = await run(
      adapterWith({
        getQueryIoPlan: jest
          .fn()
          .mockResolvedValue(
            ioPlan({ schema: 'dlu', table: 'orders', catalog: 'awsdatacatalog$iceberg-aws' })
          ),
        getTableMetadata,
        executeQueryAndGetRows: jest
          .fn()
          .mockResolvedValue([['dlu.orders', '2026-08-01 10:00:00.000 UTC']]),
      })
    );

    expect(result.dataLastUpdatedAt).toBe('2026-08-01T10:00:00.000Z');
    expect(result.coverage).toBe('complete');
    expect(result.sources[0].table).toBe('dlu.orders');
    expect(getTableMetadata).toHaveBeenCalledWith('awsdatacatalog', 'dlu', 'orders');
  });

  it('marks federated-catalog tables as unknown sources without calling the catalog', async () => {
    const getTableMetadata = jest.fn().mockResolvedValue(ICEBERG_META);
    const result = await run(
      adapterWith({
        getQueryIoPlan: jest
          .fn()
          .mockResolvedValue(
            ioPlan(
              { schema: 'dlu', table: 'orders' },
              { schema: 'ext', table: 'events', catalog: 'dynamo_catalog' }
            )
          ),
        getTableMetadata,
        executeQueryAndGetRows: jest
          .fn()
          .mockResolvedValue([['dlu.orders', '2026-08-01 10:00:00.000 UTC']]),
      })
    );

    expect(result.coverage).toBe('partial');
    expect(result.sources).toContainEqual(
      expect.objectContaining({ table: 'dynamo_catalog.ext.events', dataLastUpdatedAt: null })
    );
    expect(getTableMetadata).toHaveBeenCalledTimes(1);
  });

  it('falls back to per-table snapshot queries when the batched query fails', async () => {
    const executeQueryAndGetRows = jest.fn(async (sql: string) => {
      if (sql.includes('UNION ALL')) throw new Error('TABLE_NOT_FOUND: bad$snapshots');
      if (sql.includes('"bad$snapshots"')) throw new Error('TABLE_NOT_FOUND: bad$snapshots');
      return [['dlu.orders', '2026-08-01 10:00:00.000 UTC']];
    });
    const result = await run(
      adapterWith({
        getQueryIoPlan: jest
          .fn()
          .mockResolvedValue(
            ioPlan({ schema: 'dlu', table: 'orders' }, { schema: 'dlu', table: 'bad' })
          ),
        executeQueryAndGetRows,
      })
    );

    // One broken table degrades itself, not its neighbours.
    expect(result.dataLastUpdatedAt).toBe('2026-08-01T10:00:00.000Z');
    expect(result.coverage).toBe('partial');
    expect(result.sources).toContainEqual(
      expect.objectContaining({ table: 'dlu.bad', note: 'could not read Iceberg snapshots' })
    );
    // Batched attempt first, then one retry per table.
    expect(executeQueryAndGetRows).toHaveBeenCalledTimes(3);
  });

  it('flags an unrecognised snapshot timestamp distinctly from an empty table', async () => {
    const result = await run(
      adapterWith({
        getQueryIoPlan: jest.fn().mockResolvedValue(ioPlan({ schema: 'dlu', table: 'orders' })),
        executeQueryAndGetRows: jest
          .fn()
          .mockResolvedValue([['dlu.orders', '2026-08-01 10:00:00 Europe/Kyiv']]),
      })
    );

    expect(result).toMatchObject({ dataLastUpdatedAt: null, coverage: 'unavailable' });
    expect(result.sources[0]).toMatchObject({
      table: 'dlu.orders',
      dataLastUpdatedAt: null,
      note: 'unrecognised snapshot timestamp format',
    });
  });

  it('reports an Iceberg table with no snapshots as a null source with a note', async () => {
    const result = await run(
      adapterWith({
        getQueryIoPlan: jest.fn().mockResolvedValue(ioPlan({ schema: 'dlu', table: 'empty_t' })),
        executeQueryAndGetRows: jest.fn().mockResolvedValue([['dlu.empty_t', null]]),
      })
    );

    expect(result).toMatchObject({ dataLastUpdatedAt: null, coverage: 'unavailable' });
    expect(result.sources[0]).toMatchObject({
      table: 'dlu.empty_t',
      note: 'Iceberg table with no snapshots',
    });
  });

  it('keeps the answer when the table metadata read fails, flagged as partial', async () => {
    const result = await run(
      adapterWith({
        getQueryIoPlan: jest
          .fn()
          .mockResolvedValue(
            ioPlan({ schema: 'dlu', table: 'orders' }, { schema: 'dlu', table: 'forbidden' })
          ),
        getTableMetadata: jest.fn(async (_c: string, _d: string, table: string) => {
          if (table === 'forbidden') throw new Error('AccessDenied');
          return ICEBERG_META;
        }),
        executeQueryAndGetRows: jest
          .fn()
          .mockResolvedValue([['dlu.orders', '2026-08-01 10:00:00.000 UTC']]),
      })
    );

    expect(result.coverage).toBe('partial');
    expect(result.dataLastUpdatedAt).toBe('2026-08-01T10:00:00.000Z');
    expect(result.sources).toContainEqual(
      expect.objectContaining({ table: 'dlu.forbidden', dataLastUpdatedAt: null })
    );
  });

  it('drops an unexpanded view rather than reporting its definition-change time', async () => {
    const result = await run(
      adapterWith({
        getQueryIoPlan: jest.fn().mockResolvedValue(ioPlan({ schema: 'dlu', table: 'v_orders' })),
        getTableMetadata: jest.fn().mockResolvedValue({
          tableType: 'VIRTUAL_VIEW',
          createTime: new Date('2026-07-27T00:00:00.000Z'),
          parameters: {},
        }),
        executeQueryAndGetRows: jest.fn(),
      })
    );

    expect(result).toMatchObject({ dataLastUpdatedAt: null, coverage: 'unavailable', sources: [] });
  });

  it('reports unavailable when the IO plan has no input tables', async () => {
    const result = await run(
      adapterWith({
        getQueryIoPlan: jest.fn().mockResolvedValue(JSON.stringify({ inputTableColumnInfos: [] })),
      })
    );

    expect(result).toMatchObject({ dataLastUpdatedAt: null, coverage: 'unavailable', sources: [] });
  });

  it('keeps measuring the batch when one item fails its EXPLAIN', async () => {
    const { resolver } = createResolver(
      adapterWith({
        getQueryIoPlan: jest.fn(async (sql: string) => {
          if (sql.includes('broken')) throw new Error('SYNTAX_ERROR: line 1');
          return ioPlan({ schema: 'dlu', table: 'orders' });
        }),
        executeQueryAndGetRows: jest
          .fn()
          .mockResolvedValue([['dlu.orders', '2026-08-01 10:00:00.000 UTC']]),
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

  it('classifies and measures each table once per batch, not once per item', async () => {
    const adapter = adapterWith({
      getQueryIoPlan: jest.fn().mockResolvedValue(ioPlan({ schema: 'dlu', table: 'orders' })),
      executeQueryAndGetRows: jest
        .fn()
        .mockResolvedValue([['dlu.orders', '2026-08-01 10:00:00.000 UTC']]),
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
    // The expensive per-table lookups ran once for the whole sweep.
    expect(adapter.getTableMetadata).toHaveBeenCalledTimes(1);
    expect(adapter.executeQueryAndGetRows).toHaveBeenCalledTimes(1);
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
    expect(adapter.getQueryIoPlan).not.toHaveBeenCalled();
  });

  it('stops between items once the signal aborts, keeping what already resolved', async () => {
    const controller = new AbortController();
    const adapter = adapterWith({
      getQueryIoPlan: jest.fn(async () => {
        // First item resolves normally, then the deadline fires before the second starts.
        controller.abort();
        return ioPlan({ schema: 'dlu', table: 'orders' });
      }),
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
    expect(adapter.getQueryIoPlan).toHaveBeenCalledTimes(1);
  });

  it('resolves nothing for a storage whose config is not an Athena config', async () => {
    const adapter = adapterWith();
    const { resolver } = createResolver(adapter);

    const results = await resolver.resolveForSqlBatch({
      storage: { ...storage, config: { database: 'not-athena' } } as unknown as DataStorage,
      items: [{ key: SINGLE, sql: 'SELECT 1' }],
    });

    expect(results.size).toBe(0);
    expect(adapter.getQueryIoPlan).not.toHaveBeenCalled();
  });
});
