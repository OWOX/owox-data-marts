import type { Response } from 'express';
import { HttpDataStreamWriter } from './http-data-stream-writer.service';
import { HTTP_DATA_RUN_ID_HEADER } from './http-data.constants';

type Mock = {
  res: Response;
  headers: Record<string, string>;
  writes: Buffer[];
  flushHeadersCalls: number;
};

function createMockResponse(
  opts: {
    drainNeeded?: boolean;
    closeInsteadOfDrain?: boolean;
    errorInsteadOfDrain?: boolean;
    stall?: boolean;
  } = {}
): Mock {
  const headers: Record<string, string> = {};
  const writes: Buffer[] = [];
  let flushHeadersCalls = 0;
  const listeners = new Map<string, Array<(arg?: unknown) => void>>();
  const emit = (event: string, arg?: unknown) => {
    for (const fn of listeners.get(event) ?? []) fn(arg);
  };

  const res = {
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    flushHeaders() {
      flushHeadersCalls += 1;
    },
    write(chunk: Buffer) {
      writes.push(chunk);
      if (opts.stall) {
        return false;
      }
      if (opts.drainNeeded || opts.closeInsteadOfDrain || opts.errorInsteadOfDrain) {
        setImmediate(() => {
          if (opts.drainNeeded) emit('drain');
          else if (opts.closeInsteadOfDrain) emit('close');
          else if (opts.errorInsteadOfDrain) emit('error', new Error('socket exploded'));
        });
        return false;
      }
      return true;
    },
    once(event: string, fn: (arg?: unknown) => void) {
      const arr = listeners.get(event) ?? [];
      arr.push(fn);
      listeners.set(event, arr);
      return res;
    },
    off(event: string, fn: (arg?: unknown) => void) {
      const arr = listeners.get(event) ?? [];
      const idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
      return res;
    },
  } as unknown as Response;

  return {
    res,
    headers,
    writes,
    get flushHeadersCalls() {
      return flushHeadersCalls;
    },
  };
}

describe('HttpDataStreamWriter', () => {
  const writer = new HttpDataStreamWriter();

  it('initHeaders sets NDJSON content type, runId and flushes headers', () => {
    const mock = createMockResponse();
    writer.initHeaders(mock.res, { runId: 'run-1' });
    expect(mock.headers['Content-Type']).toBe('application/x-ndjson; charset=utf-8');
    expect(mock.headers['Cache-Control']).toBe('no-store');
    expect(mock.headers[HTTP_DATA_RUN_ID_HEADER]).toBe('run-1');
    expect(mock.flushHeadersCalls).toBe(1);
  });

  it('serializeRow serializes JSON + newline as a buffer with the correct byte length', () => {
    const chunk = writer.serializeRow({ date: '2026-05-01', revenue: 42.5 });
    expect(chunk.toString('utf-8')).toBe('{"date":"2026-05-01","revenue":42.5}\n');
    expect(chunk.length).toBe(Buffer.byteLength('{"date":"2026-05-01","revenue":42.5}\n', 'utf-8'));
  });

  it('serializeRow does not wrap rows with a type/value envelope', () => {
    const chunk = writer.serializeRow({ a: 1 });
    expect(chunk.toString('utf-8')).not.toMatch(/"type"\s*:/);
    expect(chunk.toString('utf-8')).not.toMatch(/"value"\s*:/);
  });

  it('serializeRow preserves key order matching insertion order', () => {
    const row: Record<string, unknown> = {};
    row.z = 1;
    row.a = 2;
    row.m = 3;
    expect(writer.serializeRow(row).toString('utf-8')).toBe('{"z":1,"a":2,"m":3}\n');
  });

  it("writeChunk awaits 'drain' when res.write returns false (backpressure)", async () => {
    const mock = createMockResponse({ drainNeeded: true });
    await writer.writeChunk(mock.res, writer.serializeRow({ a: 1 }));
    expect(mock.writes).toHaveLength(1);
  });

  it("writeChunk rejects on 'close' so a disconnect is not a false success", async () => {
    const mock = createMockResponse({ closeInsteadOfDrain: true });
    await expect(writer.writeChunk(mock.res, writer.serializeRow({ a: 1 }))).rejects.toThrow(
      /closed before backpressure drained/
    );
  });

  it("writeChunk rejects on 'error' and propagates the socket error", async () => {
    const mock = createMockResponse({ errorInsteadOfDrain: true });
    await expect(writer.writeChunk(mock.res, writer.serializeRow({ a: 1 }))).rejects.toThrow(
      'socket exploded'
    );
  });

  it('writeChunk rejects when the abort signal fires while waiting for backpressure', async () => {
    const mock = createMockResponse({ stall: true });
    const controller = new AbortController();
    const pending = writer.writeChunk(mock.res, writer.serializeRow({ a: 1 }), controller.signal);
    controller.abort(new Error('request timed out'));
    await expect(pending).rejects.toThrow('request timed out');
  });

  it('writeChunk rejects immediately if the abort signal is already aborted', async () => {
    const mock = createMockResponse({ stall: true });
    const controller = new AbortController();
    controller.abort(new Error('already aborted'));
    await expect(
      writer.writeChunk(mock.res, writer.serializeRow({ a: 1 }), controller.signal)
    ).rejects.toThrow('already aborted');
  });
});
