import type { BlobStore } from './types.js';

export interface SaveableFile {
  save(
    data: string,
    opts: { contentType: string; resumable: boolean; signal?: AbortSignal }
  ): Promise<void>;
}
export interface BucketLike {
  file(path: string): SaveableFile;
}
export type BucketFactory = () => Promise<BucketLike>;

const MAX_PUT_ATTEMPTS = 2;
const RETRY_DELAY_MS = 250;
const MAX_CONCURRENT_PUTS = 4;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    const t = setTimeout(resolve, ms);
    t.unref?.(); // don't keep the event loop alive for a best-effort background retry
  });
}

/** Minimal concurrency limiter so a burst of offloads can't accumulate unbounded in-flight uploads. */
class Semaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];
  constructor(private readonly max: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>(resolve => this.queue.push(resolve));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

/**
 * GCS-backed {@link BlobStore}. `@google-cloud/storage` is an optional dependency,
 * loaded lazily via {@link BucketFactory} (default = dynamic import) so base installs
 * and unit tests don't pull the GCP SDK. Uses application-default credentials.
 *
 * Best-effort: each put is retried once on failure, capped in concurrency, and bounded by a timeout
 * that also aborts the in-flight upload (cancellation depends on the client honouring the signal).
 */
export class GcsBlobStore implements BlobStore {
  private bucketPromise?: Promise<BucketLike>;
  private readonly semaphore = new Semaphore(MAX_CONCURRENT_PUTS);

  constructor(
    private readonly bucketName: string,
    private readonly timeoutMs: number,
    private readonly bucketFactory: BucketFactory = () => {
      const moduleId = '@google-cloud/storage';
      return import(moduleId).then(({ Storage }) => new Storage().bucket(bucketName) as BucketLike);
    }
  ) {}

  private bucket(): Promise<BucketLike> {
    // Reset on failure so a transient init error (SDK load / ADC) doesn't wedge every future
    // offload for the life of the process.
    return (this.bucketPromise ??= this.bucketFactory().catch((err: unknown) => {
      this.bucketPromise = undefined;
      throw err;
    }));
  }

  async put(path: string, json: string): Promise<string> {
    const target = `gs://${this.bucketName}/${path}`;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_PUT_ATTEMPTS; attempt++) {
      try {
        return await this.semaphore.run(() => this.putOnce(path, target, json));
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_PUT_ATTEMPTS) await delay(RETRY_DELAY_MS);
      }
    }
    throw lastErr;
  }

  private async putOnce(path: string, target: string, json: string): Promise<string> {
    const file = (await this.bucket()).file(path);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        // Cancel the in-flight upload (best-effort) then reject, so a stuck upload can neither
        // block the offloader nor keep leaking bytes for the whole process lifetime.
        controller.abort();
        reject(new Error(`blob store put timeout after ${this.timeoutMs}ms: ${target}`));
      }, this.timeoutMs);
      timer.unref?.();
    });
    try {
      await Promise.race([
        file.save(json, {
          contentType: 'application/json',
          resumable: false,
          signal: controller.signal,
        }),
        timeout,
      ]);
      return target;
    } finally {
      clearTimeout(timer!);
    }
  }
}
