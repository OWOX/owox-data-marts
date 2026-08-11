import { RunLogFlusher, RunLogSnapshot } from './run-log-flusher';

describe('RunLogFlusher', () => {
  const snap = (logs: number, errors = 0): RunLogSnapshot => ({
    logs: Array.from({ length: logs }, (_, i) => `l${i}`),
    errors: Array.from({ length: errors }, (_, i) => `e${i}`),
  });

  describe('flushIfDirty', () => {
    it('writes when the snapshot count grows', async () => {
      let current = snap(2);
      const write = jest.fn().mockResolvedValue(undefined);
      const flusher = new RunLogFlusher(1000, () => current, write);

      await flusher.flushIfDirty();
      expect(write).toHaveBeenCalledTimes(1);
      expect(write).toHaveBeenLastCalledWith(current);

      current = snap(5);
      await flusher.flushIfDirty();
      expect(write).toHaveBeenCalledTimes(2);
    });

    it('skips the write when the count is unchanged', async () => {
      const current = snap(3);
      const write = jest.fn().mockResolvedValue(undefined);
      const flusher = new RunLogFlusher(1000, () => current, write);

      await flusher.flushIfDirty();
      await flusher.flushIfDirty();
      expect(write).toHaveBeenCalledTimes(1);
    });

    it('never writes an empty snapshot', async () => {
      const write = jest.fn().mockResolvedValue(undefined);
      const flusher = new RunLogFlusher(1000, () => snap(0), write);

      await flusher.flushIfDirty();
      expect(write).not.toHaveBeenCalled();
    });

    it('swallows a write rejection and routes it to onError', async () => {
      const boom = new Error('db down');
      const write = jest.fn().mockRejectedValue(boom);
      const onError = jest.fn();
      const flusher = new RunLogFlusher(1000, () => snap(1), write, onError);

      await expect(flusher.flushIfDirty()).resolves.toBeUndefined();
      expect(onError).toHaveBeenCalledWith(boom);
    });

    it('retries the same snapshot on the next flush after a failed write', async () => {
      const current = snap(2);
      const write = jest
        .fn()
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValue(undefined);
      const onError = jest.fn();
      const flusher = new RunLogFlusher(1000, () => current, write, onError);

      await flusher.flushIfDirty(); // fails — lastCount must stay unset
      await flusher.flushIfDirty(); // same count, must retry

      expect(write).toHaveBeenCalledTimes(2);
      expect(onError).toHaveBeenCalledTimes(1);
    });
  });

  describe('start/stop scheduling', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('does not schedule when intervalMs <= 0', () => {
      const write = jest.fn().mockResolvedValue(undefined);
      const flusher = new RunLogFlusher(0, () => snap(1), write);
      flusher.start();
      jest.advanceTimersByTime(10000);
      expect(write).not.toHaveBeenCalled();
    });

    it('flushes on each interval tick while dirty, then stops', async () => {
      let current = snap(1);
      const write = jest.fn().mockResolvedValue(undefined);
      const flusher = new RunLogFlusher(1000, () => current, write);

      flusher.start();
      await jest.advanceTimersByTimeAsync(1000);
      expect(write).toHaveBeenCalledTimes(1);

      current = snap(2);
      await jest.advanceTimersByTimeAsync(1000);
      expect(write).toHaveBeenCalledTimes(2);

      await flusher.stop();
      current = snap(3);
      await jest.advanceTimersByTimeAsync(5000);
      expect(write).toHaveBeenCalledTimes(2);
    });

    it('stop() awaits ALL started/queued flushes (not just the last-assigned one) when a write is slower than the interval', async () => {
      // Deferred promise so we control exactly when the slow first write
      // resolves, independent of real elapsed time.
      let resolveFirst!: () => void;
      const firstWrite = new Promise<void>(res => (resolveFirst = res));

      let current = snap(1);
      // Records the call index (1 or 2) each time a write's promise actually
      // *resolves* (not when it starts) — the ground truth for "has this
      // flush's effect landed yet".
      const completedOrder: number[] = [];
      const write = jest.fn().mockImplementation(async (s: RunLogSnapshot) => {
        const myCall = s.logs.length + s.errors.length; // 1 or 2, matches snap()
        if (myCall === 1) {
          await firstWrite;
        }
        completedOrder.push(myCall);
      });
      const flusher = new RunLogFlusher(1000, () => current, write);

      flusher.start();

      // Tick 1 fires; write #1 starts but does not resolve yet (still pending
      // on `firstWrite`). Chaining means tick 2's flush cannot even begin
      // until write #1's whole flushIfDirty() (including this write call)
      // settles — a real serialization, not just an overlap-avoidance patch.
      await jest.advanceTimersByTimeAsync(1000);
      expect(write).toHaveBeenCalledTimes(1);

      // Snapshot grows so tick 2 is dirty; fire it while write #1 is STILL
      // pending. With the pre-fix bug (`this.inFlight = this.flushIfDirty()`,
      // a plain overwrite instead of a `.then()` chain), tick 2 would run
      // concurrently and its promise would fully replace `this.inFlight`,
      // so a `stop()` racing in now would only await write #2, silently
      // dropping write #1 (the terminal-write stand-in) from the chain.
      current = snap(2);
      await jest.advanceTimersByTimeAsync(1000);
      // The queued tick-2 flush is chained BEHIND write #1, which is still
      // pending — so write #2 must not have started yet.
      expect(write).toHaveBeenCalledTimes(1);

      let completedOrderAtStopSettle: number[] | null = null;
      const stopPromise = flusher.stop().then(() => {
        completedOrderAtStopSettle = [...completedOrder];
      });

      // Let write #1 finish, which unblocks the queued write #2.
      resolveFirst();
      await stopPromise;

      // stop() must not resolve until BOTH the pending write AND the flush
      // that was queued behind it have fully completed, in order.
      expect(write).toHaveBeenCalledTimes(2);
      expect(completedOrderAtStopSettle).toEqual([1, 2]);
    });
  });
});
