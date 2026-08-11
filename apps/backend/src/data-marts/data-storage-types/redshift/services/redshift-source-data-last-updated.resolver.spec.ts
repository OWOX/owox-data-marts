import { RedshiftSourceDataLastUpdatedResolver } from './redshift-source-data-last-updated.resolver';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorage } from '../../../entities/data-storage.entity';

const scan = (table: string) => `  ->  XN Seq Scan on ${table}  (cost=0.00..0.01 rows=1 width=8)`;

describe('RedshiftSourceDataLastUpdatedResolver', () => {
  const storage = {
    id: 'storage-1',
    type: DataStorageType.AWS_REDSHIFT,
    config: {
      connectionType: 'SERVERLESS',
      region: 'us-east-1',
      database: 'dev',
      workgroupName: 'wg',
    },
  } as unknown as DataStorage;

  const createResolver = (adapter: Record<string, jest.Mock>) => {
    const adapterFactory = { createFromStorage: jest.fn().mockResolvedValue(adapter) };
    return {
      resolver: new RedshiftSourceDataLastUpdatedResolver(adapterFactory as never),
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

  /** The healthy default: every named table lives in `public` and reports a time. */
  const adapterWith = (overrides: Record<string, jest.Mock> = {}) => ({
    getQueryPlan: jest.fn().mockResolvedValue([scan('orders'), scan('customers')]),
    findTablesByName: jest.fn(async (_db: string, names: string[]) =>
      names.map(name => ({ schemaName: 'public', tableName: name }))
    ),
    getSchemaTablesInfo: jest.fn().mockResolvedValue([
      { tableName: 'orders', lastModifiedTime: '2026-08-01T10:00:00.000Z' },
      { tableName: 'customers', lastModifiedTime: '2026-08-05T08:30:00.000Z' },
    ]),
    ...overrides,
  });

  it('reports the newest modification time across all scanned tables', async () => {
    const result = await run(adapterWith());

    expect(result.dataLastUpdatedAt).toBe('2026-08-05T08:30:00.000Z');
    expect(result.coverage).toBe('complete');
    expect(result.sources.map(s => s.table)).toEqual(['dev.public.orders', 'dev.public.customers']);
  });

  it('marks Spectrum external tables as unknown sources and degrades coverage to partial', async () => {
    const result = await run(
      adapterWith({
        getQueryPlan: jest
          .fn()
          .mockResolvedValue([
            scan('orders'),
            '      ->  S3 Seq Scan spectrum.sales location:"s3://bucket/sales" format:TEXT',
          ]),
        getSchemaTablesInfo: jest
          .fn()
          .mockResolvedValue([
            { tableName: 'orders', lastModifiedTime: '2026-08-01T10:00:00.000Z' },
          ]),
      })
    );

    expect(result.coverage).toBe('partial');
    expect(result.dataLastUpdatedAt).toBe('2026-08-01T10:00:00.000Z');
    expect(result.sources).toContainEqual(
      expect.objectContaining({ table: 'dev.spectrum.sales', dataLastUpdatedAt: null })
    );
  });

  it('reports an ambiguous bare name as unknown instead of guessing a schema', async () => {
    const result = await run(
      adapterWith({
        getQueryPlan: jest.fn().mockResolvedValue([scan('orders'), scan('customers')]),
        findTablesByName: jest.fn(async (_db: string, names: string[]) => [
          // `orders` exists in two schemas; a guess could report a NEWER time than the truth.
          { schemaName: 'public', tableName: 'orders' },
          { schemaName: 'staging', tableName: 'orders' },
          ...names
            .filter(name => name === 'customers')
            .map(name => ({ schemaName: 'public', tableName: name })),
        ]),
        getSchemaTablesInfo: jest
          .fn()
          .mockResolvedValue([
            { tableName: 'customers', lastModifiedTime: '2026-08-05T08:30:00.000Z' },
          ]),
      })
    );

    expect(result.coverage).toBe('partial');
    expect(result.dataLastUpdatedAt).toBe('2026-08-05T08:30:00.000Z');
    expect(result.sources).toContainEqual(
      expect.objectContaining({
        table: 'orders',
        dataLastUpdatedAt: null,
        note: expect.stringContaining('2 schemas'),
      })
    );
  });

  it('reports a name the catalog cannot place as unknown with a note', async () => {
    const result = await run(
      adapterWith({
        getQueryPlan: jest.fn().mockResolvedValue([scan('orders'), scan('elsewhere_tbl')]),
        findTablesByName: jest
          .fn()
          .mockResolvedValue([{ schemaName: 'public', tableName: 'orders' }]),
        getSchemaTablesInfo: jest
          .fn()
          .mockResolvedValue([
            { tableName: 'orders', lastModifiedTime: '2026-08-01T10:00:00.000Z' },
          ]),
      })
    );

    expect(result.coverage).toBe('partial');
    expect(result.sources).toContainEqual(
      expect.objectContaining({ table: 'elsewhere_tbl', dataLastUpdatedAt: null })
    );
  });

  it('degrades to a null source when Redshift reports no modification time (older release)', async () => {
    const result = await run(
      adapterWith({
        getQueryPlan: jest.fn().mockResolvedValue([scan('orders')]),
        getSchemaTablesInfo: jest
          .fn()
          .mockResolvedValue([{ tableName: 'orders', lastModifiedTime: null }]),
      })
    );

    expect(result).toMatchObject({ dataLastUpdatedAt: null, coverage: 'unavailable' });
    expect(result.sources[0]).toMatchObject({
      table: 'dev.public.orders',
      dataLastUpdatedAt: null,
      note: 'no modification time reported by Redshift',
    });
  });

  it('keeps the answer when one schema metadata read fails, flagged as partial', async () => {
    const result = await run(
      adapterWith({
        getQueryPlan: jest.fn().mockResolvedValue([scan('orders'), scan('events')]),
        findTablesByName: jest.fn().mockResolvedValue([
          { schemaName: 'public', tableName: 'orders' },
          { schemaName: 'huge_schema', tableName: 'events' },
        ]),
        getSchemaTablesInfo: jest.fn(async (_db: string, schema: string) => {
          if (schema === 'huge_schema') throw new Error('SHOW TABLES limit exceeded');
          return [{ tableName: 'orders', lastModifiedTime: '2026-08-01T10:00:00.000Z' }];
        }),
      })
    );

    expect(result.coverage).toBe('partial');
    expect(result.dataLastUpdatedAt).toBe('2026-08-01T10:00:00.000Z');
    expect(result.sources).toContainEqual(
      expect.objectContaining({ table: 'dev.huge_schema.events', dataLastUpdatedAt: null })
    );
  });

  it('renames a materialized view backing table to the view itself', async () => {
    const result = await run(
      adapterWith({
        getQueryPlan: jest.fn().mockResolvedValue([scan('mv_tbl__daily_totals__0')]),
        findTablesByName: jest
          .fn()
          .mockResolvedValue([{ schemaName: 'public', tableName: 'mv_tbl__daily_totals__0' }]),
        getSchemaTablesInfo: jest
          .fn()
          .mockResolvedValue([
            { tableName: 'mv_tbl__daily_totals__0', lastModifiedTime: '2026-08-03T00:00:00.000Z' },
          ]),
      })
    );

    expect(result.sources).toEqual([
      {
        table: 'dev.public.daily_totals',
        dataLastUpdatedAt: '2026-08-03T00:00:00.000Z',
        note: 'materialized view — time of the last refresh',
      },
    ]);
    expect(result.coverage).toBe('complete');
  });

  it('reports unavailable when the plan contains no table scans', async () => {
    const result = await run(
      adapterWith({
        getQueryPlan: jest.fn().mockResolvedValue(['XN Result  (cost=0.00..0.01 rows=1 width=0)']),
      })
    );

    expect(result).toMatchObject({ dataLastUpdatedAt: null, coverage: 'unavailable', sources: [] });
  });

  it('keeps measuring the batch when one item fails its EXPLAIN', async () => {
    const { resolver } = createResolver(
      adapterWith({
        getQueryPlan: jest.fn(async (sql: string) => {
          if (sql.includes('broken')) throw new Error('EXPLAIN failed: relation does not exist');
          return [scan('orders')];
        }),
        getSchemaTablesInfo: jest
          .fn()
          .mockResolvedValue([
            { tableName: 'orders', lastModifiedTime: '2026-08-01T10:00:00.000Z' },
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
    expect(results.get('dm-ok')?.dataLastUpdatedAt).toBe('2026-08-01T10:00:00.000Z');
  });

  it('shares catalog and schema lookups across a batch instead of repeating them', async () => {
    const adapter = adapterWith({
      getQueryPlan: jest.fn().mockResolvedValue([scan('orders')]),
      findTablesByName: jest
        .fn()
        .mockResolvedValue([{ schemaName: 'public', tableName: 'orders' }]),
      getSchemaTablesInfo: jest
        .fn()
        .mockResolvedValue([{ tableName: 'orders', lastModifiedTime: '2026-08-01T10:00:00.000Z' }]),
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
    // The expensive per-storage lookups ran once for the whole sweep.
    expect(adapter.findTablesByName).toHaveBeenCalledTimes(1);
    expect(adapter.getSchemaTablesInfo).toHaveBeenCalledTimes(1);
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
    expect(adapter.getQueryPlan).not.toHaveBeenCalled();
  });

  it('stops between items once the signal aborts, keeping what already resolved', async () => {
    const controller = new AbortController();
    const adapter = adapterWith({
      getQueryPlan: jest.fn(async () => {
        // First item resolves normally, then the deadline fires before the second starts.
        controller.abort();
        return [scan('orders')];
      }),
      getSchemaTablesInfo: jest
        .fn()
        .mockResolvedValue([{ tableName: 'orders', lastModifiedTime: '2026-08-01T10:00:00.000Z' }]),
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
    expect(adapter.getQueryPlan).toHaveBeenCalledTimes(1);
  });

  it('resolves nothing for a storage whose config is not a Redshift config', async () => {
    const adapter = adapterWith();
    const { resolver } = createResolver(adapter);

    const results = await resolver.resolveForSqlBatch({
      storage: { ...storage, config: { projectId: 'not-redshift' } } as unknown as DataStorage,
      items: [{ key: SINGLE, sql: 'SELECT 1' }],
    });

    expect(results.size).toBe(0);
    expect(adapter.getQueryPlan).not.toHaveBeenCalled();
  });
});
