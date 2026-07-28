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

  const createService = (registry: { tryResolve: jest.Mock }) =>
    new SourceDataLastUpdatedService(registry as never);

  it('returns what the storage resolver reports', async () => {
    const resolver = { resolveForSql: jest.fn().mockResolvedValue(resolved) };
    const service = createService({ tryResolve: jest.fn().mockResolvedValue(resolver) });

    const result = await service.resolveForSql({ storage, sql: 'SELECT 1' });

    expect(result).toEqual(resolved);
    expect(resolver.resolveForSql).toHaveBeenCalledWith(
      expect.objectContaining({ storage, sql: 'SELECT 1' })
    );
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
    const resolver = {
      resolveForSql: jest.fn().mockRejectedValue(new Error('dry run exploded')),
    };
    const service = createService({ tryResolve: jest.fn().mockResolvedValue(resolver) });

    const result = await service.resolveForSql({ storage, sql: 'SELECT 1' });

    expect(result).toMatchObject({ dataLastUpdatedAt: null, coverage: 'unavailable' });
  });

  it('gives up at the soft deadline rather than holding up the response', async () => {
    jest.useFakeTimers();
    try {
      const resolver = { resolveForSql: jest.fn().mockReturnValue(new Promise(() => {})) };
      const service = createService({ tryResolve: jest.fn().mockResolvedValue(resolver) });

      const pending = service.resolveForSql({ storage, sql: 'SELECT 1', softTimeoutMs: 15_000 });
      // Let tryResolve settle before the timer fires.
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(15_000);

      await expect(pending).resolves.toMatchObject({
        dataLastUpdatedAt: null,
        coverage: 'unavailable',
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('aborts the in-flight lookup when the run is cancelled', async () => {
    const controller = new AbortController();
    let observed: AbortSignal | undefined;
    let finish: (() => void) | undefined;
    const resolver = {
      resolveForSql: jest.fn(async (input: { signal?: AbortSignal }) => {
        observed = input.signal;
        await new Promise<void>(resolve => {
          finish = resolve;
        });
        return resolved;
      }),
    };
    const service = createService({ tryResolve: jest.fn().mockResolvedValue(resolver) });

    const pending = service.resolveForSql({
      storage,
      sql: 'SELECT 1',
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
    const resolver = {
      resolveForSql: jest.fn(async (input: { signal?: AbortSignal }) => {
        observed = input.signal;
        return resolved;
      }),
    };
    const service = createService({ tryResolve: jest.fn().mockResolvedValue(resolver) });

    await service.resolveForSql({ storage, sql: 'SELECT 1', signal: controller.signal });

    expect(observed?.aborted).toBe(true);
  });
});
