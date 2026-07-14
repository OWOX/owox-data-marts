import { jest } from '@jest/globals';
import { GcsBlobStore, type BucketLike } from './gcs-blob-store.js';

const fakeBucket = (): { bucket: BucketLike; saved: { path: string; data: string }[] } => {
  const saved: { path: string; data: string }[] = [];
  const bucket: BucketLike = {
    file: (path: string) => ({
      save: async (data: string) => {
        saved.push({ path, data });
      },
    }),
  };
  return { bucket, saved };
};

describe('GcsBlobStore', () => {
  it('вантажить JSON і повертає gs:// URI', async () => {
    const { bucket, saved } = fakeBucket();
    const store = new GcsBlobStore('my-bucket', 5000, async () => bucket);
    const uri = await store.put('mcp/2026-07-09/p1/r1.json', '{"a":1}');
    expect(uri).toBe('gs://my-bucket/mcp/2026-07-09/p1/r1.json');
    expect(saved).toEqual([{ path: 'mcp/2026-07-09/p1/r1.json', data: '{"a":1}' }]);
  });

  it('фабрика бакета викликається один раз (кешується)', async () => {
    const { bucket } = fakeBucket();
    const factory = jest.fn(async () => bucket);
    const store = new GcsBlobStore('b', 5000, factory);
    await store.put('a.json', '{}');
    await store.put('b.json', '{}');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('транзієнтний збій ретраїться в межах одного put (rejected promise не кешується)', async () => {
    const { bucket } = fakeBucket();
    let calls = 0;
    const factory = jest.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error('ADC boom');
      return bucket;
    });
    const store = new GcsBlobStore('b', 5000, factory);
    // First attempt fails to init; the put retries, re-inits, and succeeds.
    await expect(store.put('a.json', '{}')).resolves.toBe('gs://b/a.json');
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('вичерпавши ретраї, кидає останню помилку', async () => {
    const factory = jest.fn(async () => {
      throw new Error('ADC down');
    });
    const store = new GcsBlobStore('b', 5000, factory);
    await expect(store.put('a.json', '{}')).rejects.toThrow('ADC down');
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('таймаут: save, що зависає, відхиляється з bucket/path у повідомленні', async () => {
    const bucket: BucketLike = {
      file: () => ({ save: () => new Promise<void>(() => {}) }),
    };
    const store = new GcsBlobStore('b', 20, async () => bucket);
    const err = await store.put('mcp/d/p/r.json', '{}').catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/timeout after 20ms/i);
    expect(err.message).toContain('gs://b/mcp/d/p/r.json');
  });

  it('таймаут скасовує in-flight upload через AbortSignal', async () => {
    let aborted = false;
    const bucket: BucketLike = {
      file: () => ({
        save: (_data, opts) =>
          new Promise<void>((_, reject) => {
            opts.signal?.addEventListener('abort', () => {
              aborted = true;
              reject(new Error('aborted'));
            });
          }),
      }),
    };
    const store = new GcsBlobStore('b', 20, async () => bucket);
    await expect(store.put('x.json', '{}')).rejects.toThrow();
    expect(aborted).toBe(true);
  });

  it('обмежує кількість одночасних завантажень', async () => {
    let inFlight = 0;
    let peak = 0;
    const gates: Array<() => void> = [];
    const bucket: BucketLike = {
      file: () => ({
        save: () =>
          new Promise<void>(resolve => {
            inFlight++;
            peak = Math.max(peak, inFlight);
            gates.push(() => {
              inFlight--;
              resolve();
            });
          }),
      }),
    };
    const store = new GcsBlobStore('b', 5000, async () => bucket);
    const all = Promise.all(Array.from({ length: 12 }, (_, i) => store.put(`f${i}.json`, '{}')));
    // Release in waves; each wave lets the next queued uploads start.
    for (let wave = 0; wave < 12; wave++) {
      await new Promise(r => setTimeout(r, 5));
      gates.splice(0).forEach(fn => fn());
    }
    await all;
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1); // proves uploads ran concurrently up to the cap
  });
});
