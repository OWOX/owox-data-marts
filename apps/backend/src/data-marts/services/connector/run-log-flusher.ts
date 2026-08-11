import { ConnectorMessage } from '../../connector-types/connector-message/schemas/connector-message.schema';

export interface RunLogSnapshot {
  logs: string[];
  errors: string[];
}

/**
 * Builds a `getSnapshot` over a run's two live message buffers that serializes each
 * message exactly once.
 *
 * The obvious form — `logs.map(m => JSON.stringify(m))` — re-serializes every message
 * the run has produced so far on EVERY flush, so a run emitting n messages pays O(n^2)
 * for the same bytes. Only the entries appended since the last snapshot are new: a
 * buffered message is pushed once and never mutated afterwards, so an earlier
 * serialization can be reused verbatim.
 *
 * Each call returns a fresh array rather than the cache. {@link RunLogFlusher} keeps the
 * snapshot it last wrote and the terminal write subtracts it from the persisted
 * baseline, so a snapshot has to keep describing what was written; one that followed the
 * buffer would describe the run's final state instead, and the terminal write would then
 * subtract entries that were never flushed.
 */
export function createRunLogSnapshotReader(
  logs: ConnectorMessage[],
  errors: ConnectorMessage[]
): () => RunLogSnapshot {
  const serializedLogs: string[] = [];
  const serializedErrors: string[] = [];

  const extend = (cache: string[], buffer: ConnectorMessage[]): string[] => {
    for (let i = cache.length; i < buffer.length; i++) {
      cache.push(JSON.stringify(buffer[i]));
    }
    return cache.slice();
  };

  return () => ({
    logs: extend(serializedLogs, logs),
    errors: extend(serializedErrors, errors),
  });
}

/**
 * Periodically persists a run's in-flight log snapshot while it executes.
 *
 * The executor holds logs in memory and only writes them to the DB when the run
 * finishes; this flusher writes intermediate snapshots on a throttled interval so
 * the Run History poll can render them live. It is deliberately best-effort: a
 * failed intermediate write is swallowed (routed to `onError`) and the authoritative
 * final write remains the executor's terminal `updateRunStatus`. `stop()` awaits any
 * in-flight flush so a later terminal write always wins the last word.
 */
export class RunLogFlusher {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastCount = -1;
  private inFlight: Promise<void> = Promise.resolve();
  private persisted: RunLogSnapshot | null = null;

  constructor(
    private readonly intervalMs: number,
    private readonly getSnapshot: () => RunLogSnapshot,
    private readonly write: (snapshot: RunLogSnapshot) => Promise<void>,
    private readonly onError?: (error: unknown) => void
  ) {}

  start(): void {
    if (this.intervalMs <= 0 || this.timer !== null) return;
    this.timer = setInterval(() => {
      // Chain onto the current tail instead of replacing it. If a previous
      // flush is still writing when this tick fires, the new flush is queued
      // to run after it settles, so `this.inFlight` always represents the
      // full chain of every flush started so far — not just the latest one.
      // This guarantees `stop()` (which awaits `this.inFlight`) waits for
      // ALL of them, so an overlapping intermediate write can never resolve
      // (and be observed as "final") after the run's actual terminal write.
      this.inFlight = this.inFlight.then(() => this.flushIfDirty());
    }, this.intervalMs);
  }

  async flushIfDirty(): Promise<void> {
    const snapshot = this.getSnapshot();
    const count = snapshot.logs.length + snapshot.errors.length;
    if (count === 0 || count === this.lastCount) return;
    try {
      await this.write(snapshot);
      // Only mark this count persisted after a successful write, so a failed
      // flush is retried on the next tick instead of being silently skipped.
      this.lastCount = count;
      this.persisted = snapshot;
    } catch (error) {
      this.onError?.(error);
    }
  }

  /**
   * The snapshot this flusher last wrote successfully, or null if it never wrote one.
   *
   * The terminal write re-supplies this execution's whole output, so whatever is in the
   * row because of an intermediate flush would otherwise be counted twice. Reporting it
   * lets the terminal write subtract exactly what this flusher put there, while still
   * preserving output persisted by any EARLIER attempt of the same run.
   *
   * Read after {@link stop}, which awaits every started flush, so the value is final.
   */
  persistedSnapshot(): RunLogSnapshot | null {
    return this.persisted;
  }

  async stop(): Promise<void> {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.inFlight;
  }
}
