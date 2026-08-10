import { SourceDataLastUpdatedService } from './source-data-last-updated.service';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataStorage } from '../entities/data-storage.entity';

describe('SourceDataLastUpdatedService', () => {
  const storage = {
    id: 'storage-1',
    type: DataStorageType.GOOGLE_BIGQUERY,
  } as unknown as DataStorage;

  const resolved = {
    dataLastUpdatedAt: '2026-07-25T08:30:00.000Z',
    computedAt: '2026-07-28T00:00:00.000Z',
    coverage: 'complete' as const,
    sources: [{ table: 'my-project.ds.orders', dataLastUpdatedAt: '2026-07-25T08:30:00.000Z' }],
  };

  const queryBuilderFacade = {
    buildQuery: jest.fn().mockResolvedValue({ sql: 'SELECT * FROM t', params: [] }),
  };

  const createService = (registry: { tryResolve: jest.Mock }) =>
    new SourceDataLastUpdatedService(registry as never, queryBuilderFacade as never);

  const withResolver = (resolveForSqlBatch: jest.Mock) =>
    createService({ tryResolve: jest.fn().mockResolvedValue({ resolveForSqlBatch }) });

  describe('single lookup', () => {
    it('returns what the storage resolver reports', async () => {
      const resolveForSqlBatch = jest.fn().mockResolvedValue(new Map([['single', resolved]]));
      const service = withResolver(resolveForSqlBatch);

      const result = await service.resolveForSql({ storage, sql: 'SELECT 1' });

      expect(result).toEqual(resolved);
      expect(resolveForSqlBatch).toHaveBeenCalledWith(
        expect.objectContaining({
          storage,
          items: [expect.objectContaining({ sql: 'SELECT 1' })],
        })
      );
    });

    it('reports unavailable when the resolver leaves the key out', async () => {
      const service = withResolver(jest.fn().mockResolvedValue(new Map()));

      const result = await service.resolveForSql({ storage, sql: 'SELECT 1' });

      expect(result).toMatchObject({ dataLastUpdatedAt: null, coverage: 'unavailable' });
    });

    it('reports unavailable for a storage with no resolver registered', async () => {
      const service = createService({ tryResolve: jest.fn().mockResolvedValue(undefined) });

      const result = await service.resolveForSql({
        storage: { ...storage, type: DataStorageType.AWS_REDSHIFT } as DataStorage,
        sql: 'SELECT 1',
      });

      expect(result).toMatchObject({ dataLastUpdatedAt: null, coverage: 'unavailable' });
    });

    it('swallows a resolver failure instead of failing the caller', async () => {
      const service = withResolver(jest.fn().mockRejectedValue(new Error('dry run exploded')));

      const result = await service.resolveForSql({ storage, sql: 'SELECT 1' });

      expect(result).toMatchObject({ dataLastUpdatedAt: null, coverage: 'unavailable' });
    });

    it('swallows a resolver that throws synchronously', async () => {
      // The never-rejects contract is what keeps this off the caller's critical path, so it must
      // hold even for a resolver that blows up before returning a promise.
      const service = withResolver(
        jest.fn(() => {
          throw new TypeError('resolver is not a function');
        })
      );

      const result = await service.resolveForSql({ storage, sql: 'SELECT 1' });

      expect(result).toMatchObject({ dataLastUpdatedAt: null, coverage: 'unavailable' });
    });
  });

  describe('batch lookup', () => {
    it('measures every item in one resolver call', async () => {
      const resolveForSqlBatch = jest.fn(
        async (input: { items: { key: string }[] }) =>
          new Map(input.items.map(item => [item.key, resolved]))
      );
      const service = withResolver(resolveForSqlBatch);

      const results = await service.resolveForSqlBatch({
        storage,
        items: [
          { key: 'dm1', sql: 'SELECT 1' },
          { key: 'dm2', sql: 'SELECT 2' },
        ],
      });

      // One call for the whole set: the expensive part is per-storage, not per-item.
      expect(resolveForSqlBatch).toHaveBeenCalledTimes(1);
      expect(results.get('dm1')).toEqual(resolved);
      expect(results.get('dm2')).toEqual(resolved);
    });

    it('does no work for an empty batch', async () => {
      const resolveForSqlBatch = jest.fn();
      const service = withResolver(resolveForSqlBatch);

      const results = await service.resolveForSqlBatch({ storage, items: [] });

      expect(results.size).toBe(0);
      expect(resolveForSqlBatch).not.toHaveBeenCalled();
    });

    it('gives up at the soft deadline rather than holding up the response', async () => {
      jest.useFakeTimers();
      try {
        const service = withResolver(jest.fn().mockReturnValue(new Promise(() => {})));

        const pending = service.resolveForSqlBatch({
          storage,
          items: [{ key: 'dm1', sql: 'SELECT 1' }],
          softTimeoutMs: 15_000,
        });
        // Let tryResolve settle before the timer fires.
        await Promise.resolve();
        await Promise.resolve();
        jest.advanceTimersByTime(15_000);

        // An empty map means "nothing new" — callers keep whatever they already had.
        await expect(pending).resolves.toEqual(new Map());
      } finally {
        jest.useRealTimers();
      }
    });

    it('aborts the in-flight lookup when the run is cancelled', async () => {
      const controller = new AbortController();
      let observed: AbortSignal | undefined;
      let finish: (() => void) | undefined;
      const service = withResolver(
        jest.fn(async (input: { signal?: AbortSignal }) => {
          observed = input.signal;
          await new Promise<void>(resolve => {
            finish = resolve;
          });
          return new Map();
        })
      );

      const pending = service.resolveForSqlBatch({
        storage,
        items: [{ key: 'dm1', sql: 'SELECT 1' }],
        signal: controller.signal,
      });
      // Let the resolver start so there is in-flight work to cancel.
      await Promise.resolve();
      await Promise.resolve();

      controller.abort();
      expect(observed?.aborted).toBe(true);

      finish?.();
      await pending;
    });

    it('does not start work when the run was already cancelled', async () => {
      const controller = new AbortController();
      controller.abort();
      let observed: AbortSignal | undefined;
      const service = withResolver(
        jest.fn(async (input: { signal?: AbortSignal }) => {
          observed = input.signal;
          return new Map();
        })
      );

      await service.resolveForSqlBatch({
        storage,
        items: [{ key: 'dm1', sql: 'SELECT 1' }],
        signal: controller.signal,
      });

      expect(observed?.aborted).toBe(true);
    });
  });
});
