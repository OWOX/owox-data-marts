import { BigQuerySourceDataLastUpdatedResolver } from './bigquery-source-data-last-updated.resolver';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorage } from '../../../entities/data-storage.entity';

const ref = (tableId: string, datasetId = 'ds', projectId = 'my-project') => ({
  projectId,
  datasetId,
  tableId,
});

const asDate = (iso: string) => new Date(iso);

describe('BigQuerySourceDataLastUpdatedResolver', () => {
  const storage = {
    id: 'storage-1',
    type: DataStorageType.GOOGLE_BIGQUERY,
    config: { projectId: 'my-project', location: 'US' },
  } as unknown as DataStorage;

  const createResolver = (adapter: Record<string, jest.Mock>) => {
    const adapterFactory = { createFromStorage: jest.fn().mockResolvedValue(adapter) };
    return {
      resolver: new BigQuerySourceDataLastUpdatedResolver(adapterFactory as never),
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

  it('reports the newest modification time across all referenced tables', async () => {
    const result = await run({
      executeDryRunQuery: jest.fn().mockResolvedValue({
        referencedTables: [ref('orders'), ref('customers')],
      }),
      getTableLastModified: jest.fn(async (table: { tableId: string }) =>
        table.tableId === 'orders'
          ? { type: 'TABLE', lastModifiedTime: asDate('2026-07-20T10:00:00.000Z') }
          : { type: 'TABLE', lastModifiedTime: asDate('2026-07-25T08:30:00.000Z') }
      ),
    });

    expect(result.dataLastUpdatedAt).toBe('2026-07-25T08:30:00.000Z');
    expect(result.coverage).toBe('complete');
    expect(result.sources).toHaveLength(2);
  });

  it('passes composed sql params to the dry run so parameterised queries validate', async () => {
    const executeDryRunQuery = jest.fn().mockResolvedValue({ referencedTables: [ref('orders')] });
    const { resolver } = createResolver({
      executeDryRunQuery,
      getTableLastModified: jest
        .fn()
        .mockResolvedValue({ type: 'TABLE', lastModifiedTime: asDate('2026-07-20T00:00:00Z') }),
    });

    const params = [{ name: 'p0', value: 'fb' }];
    await resolver.resolveForSqlBatch({
      storage,
      items: [{ key: SINGLE, sql: 'SELECT 1 WHERE c = @p0', params }],
    });

    expect(executeDryRunQuery).toHaveBeenCalledWith('SELECT 1 WHERE c = @p0', params);
  });

  it('drops views entirely rather than reporting their definition-change time', async () => {
    const result = await run({
      executeDryRunQuery: jest.fn().mockResolvedValue({
        referencedTables: [ref('v_orders'), ref('orders')],
      }),
      getTableLastModified: jest.fn(async (table: { tableId: string }) =>
        table.tableId === 'v_orders'
          ? // A view "modified" far more recently than its data — the trap this drop exists for.
            { type: 'VIEW', lastModifiedTime: asDate('2026-07-27T00:00:00.000Z') }
          : { type: 'TABLE', lastModifiedTime: asDate('2026-07-10T00:00:00.000Z') }
      ),
    });

    expect(result.dataLastUpdatedAt).toBe('2026-07-10T00:00:00.000Z');
    expect(result.sources.map(s => s.table)).toEqual(['my-project.ds.orders']);
    expect(result.coverage).toBe('complete');
  });

  it('marks external tables as unknown sources and degrades coverage to partial', async () => {
    const result = await run({
      executeDryRunQuery: jest.fn().mockResolvedValue({
        referencedTables: [ref('sheet_feed'), ref('orders')],
      }),
      getTableLastModified: jest.fn(async (table: { tableId: string }) =>
        table.tableId === 'sheet_feed'
          ? { type: 'EXTERNAL', lastModifiedTime: null }
          : { type: 'TABLE', lastModifiedTime: asDate('2026-07-10T00:00:00.000Z') }
      ),
    });

    expect(result.coverage).toBe('partial');
    expect(result.dataLastUpdatedAt).toBe('2026-07-10T00:00:00.000Z');
    expect(result.sources).toContainEqual(
      expect.objectContaining({ table: 'my-project.ds.sheet_feed', dataLastUpdatedAt: null })
    );
  });

  it('keeps the answer when one table read fails, flagged as partial', async () => {
    const result = await run({
      executeDryRunQuery: jest.fn().mockResolvedValue({
        referencedTables: [ref('orders'), ref('forbidden')],
      }),
      getTableLastModified: jest.fn(async (table: { tableId: string }) => {
        if (table.tableId === 'forbidden') throw new Error('403 access denied');
        return { type: 'TABLE', lastModifiedTime: asDate('2026-07-10T00:00:00.000Z') };
      }),
    });

    expect(result.coverage).toBe('partial');
    expect(result.dataLastUpdatedAt).toBe('2026-07-10T00:00:00.000Z');
  });

  it('collapses an explicit wildcard reference into one __TABLES__ rollup', async () => {
    const getMaxShardLastModified = jest.fn().mockResolvedValue(asDate('2026-07-26T00:00:00.000Z'));
    const getTableLastModified = jest.fn();

    const result = await run({
      executeDryRunQuery: jest.fn().mockResolvedValue({ referencedTables: [ref('events_*')] }),
      getTableLastModified,
      getMaxShardLastModified,
    });

    expect(getMaxShardLastModified).toHaveBeenCalledWith('my-project', 'ds', 'events_');
    expect(getTableLastModified).not.toHaveBeenCalled();
    expect(result.dataLastUpdatedAt).toBe('2026-07-26T00:00:00.000Z');
    expect(result.sources[0].table).toBe('my-project.ds.events_*');
  });

  it('collapses an expanded shard list into one rollup instead of one call per shard', async () => {
    const getMaxShardLastModified = jest.fn().mockResolvedValue(asDate('2026-07-26T00:00:00.000Z'));
    const getTableLastModified = jest.fn();

    // BigQuery may report a wildcard query as its individual shards; that must not become
    // hundreds of metadata calls.
    const result = await run({
      executeDryRunQuery: jest.fn().mockResolvedValue({
        referencedTables: [ref('events_20260724'), ref('events_20260725'), ref('events_20260726')],
      }),
      getTableLastModified,
      getMaxShardLastModified,
    });

    expect(getMaxShardLastModified).toHaveBeenCalledTimes(1);
    expect(getMaxShardLastModified).toHaveBeenCalledWith('my-project', 'ds', 'events_');
    expect(getTableLastModified).not.toHaveBeenCalled();
    expect(result.dataLastUpdatedAt).toBe('2026-07-26T00:00:00.000Z');
  });

  it('treats a lone date-suffixed table as an ordinary table, not a shard set', async () => {
    const getMaxShardLastModified = jest.fn();
    const result = await run({
      executeDryRunQuery: jest
        .fn()
        .mockResolvedValue({ referencedTables: [ref('snapshot_20260101')] }),
      getTableLastModified: jest
        .fn()
        .mockResolvedValue({ type: 'TABLE', lastModifiedTime: asDate('2026-01-02T00:00:00Z') }),
      getMaxShardLastModified,
    });

    expect(getMaxShardLastModified).not.toHaveBeenCalled();
    expect(result.sources[0].table).toBe('my-project.ds.snapshot_20260101');
  });

  it('reports partial once the referenced-table list reaches BigQuery cap', async () => {
    const referencedTables = Array.from({ length: 50 }, (_, i) => ref(`t${i}`));
    const result = await run({
      executeDryRunQuery: jest.fn().mockResolvedValue({ referencedTables }),
      getTableLastModified: jest
        .fn()
        .mockResolvedValue({ type: 'TABLE', lastModifiedTime: asDate('2026-07-10T00:00:00Z') }),
    });

    // At the cap we cannot distinguish a complete list from a truncated one, so we never claim complete.
    expect(result.coverage).toBe('partial');
  });

  it('reports unavailable when the dry run returns no referenced tables', async () => {
    const result = await run({
      executeDryRunQuery: jest.fn().mockResolvedValue({ referencedTables: [] }),
      getTableLastModified: jest.fn(),
    });

    expect(result).toMatchObject({
      dataLastUpdatedAt: null,
      coverage: 'unavailable',
      sources: [],
    });
  });

  it('keeps measuring the batch when one item fails its dry run', async () => {
    const { resolver } = createResolver({
      executeDryRunQuery: jest.fn(async (sql: string) => {
        if (sql.includes('broken')) throw new Error('dry run failed: table not found');
        return { referencedTables: [ref('orders')] };
      }),
      getTableLastModified: jest
        .fn()
        .mockResolvedValue({ type: 'TABLE', lastModifiedTime: asDate('2026-07-25T08:30:00Z') }),
    });

    const results = await resolver.resolveForSqlBatch({
      storage,
      items: [
        { key: 'dm-broken', sql: 'SELECT * FROM broken' },
        { key: 'dm-ok', sql: 'SELECT * FROM orders' },
      ],
    });

    // The broken item's key is simply absent ("no new information"); the healthy one resolves.
    expect(results.has('dm-broken')).toBe(false);
    expect(results.get('dm-ok')?.dataLastUpdatedAt).toBe('2026-07-25T08:30:00.000Z');
  });

  it('reports unavailable rather than a view definition time when only views are referenced', async () => {
    // If BigQuery ever stops expanding a view to its base tables, staying silent is the
    // intended outcome: a view's modification time describes its definition, not its data.
    const result = await run({
      executeDryRunQuery: jest.fn().mockResolvedValue({ referencedTables: [ref('v_orders')] }),
      getTableLastModified: jest
        .fn()
        .mockResolvedValue({ type: 'VIEW', lastModifiedTime: asDate('2026-07-27T00:00:00Z') }),
    });

    expect(result).toMatchObject({
      dataLastUpdatedAt: null,
      coverage: 'unavailable',
      sources: [],
    });
  });

  it('reports unavailable when every source resolves to an unknown time', async () => {
    const result = await run({
      executeDryRunQuery: jest.fn().mockResolvedValue({ referencedTables: [ref('sheet_feed')] }),
      getTableLastModified: jest
        .fn()
        .mockResolvedValue({ type: 'EXTERNAL', lastModifiedTime: null }),
    });

    expect(result.dataLastUpdatedAt).toBeNull();
    expect(result.coverage).toBe('unavailable');
    // The unknown source is still listed — a named gap beats an empty answer.
    expect(result.sources).toHaveLength(1);
  });
});
