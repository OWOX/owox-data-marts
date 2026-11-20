import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteDatabaseStore } from './sqlite-database-store.js';

const intent = { userId: 'u1', name: 'product_intent', origin: 'explicit_click' };
const a = '{"source":"facebook-marketing","storage":"google-bigquery"}';
const b = '{"source":"google-ads"}';

describe('SqliteDatabaseStore user signals', () => {
  let file: string;
  let store: SqliteDatabaseStore;

  beforeEach(() => {
    file = join(tmpdir(), `user-signals-${randomUUID()}.db`);
    store = new SqliteDatabaseStore(file);
  });

  afterEach(() => {
    rmSync(file, { force: true });
  });

  it('stores a new signal with a count of one', async () => {
    await store.recordUserSignal({ ...intent, value: a });
    const [signal] = await store.getUserSignals('u1');
    expect(signal).toMatchObject({ ...intent, value: a, seenCount: 1 });
    expect(signal.firstSeenAt).toBe(signal.lastSeenAt);
    expect(new Date(signal.firstSeenAt).toISOString()).toBe(signal.firstSeenAt);
  });

  it('counts a repeated value instead of adding a row', async () => {
    await store.recordUserSignal({ ...intent, value: a });
    const [first] = await store.getUserSignals('u1');
    await store.recordUserSignal({ ...intent, value: a });
    const signals = await store.getUserSignals('u1');
    expect(signals).toHaveLength(1);
    expect(signals[0].seenCount).toBe(2);
    expect(signals[0].firstSeenAt).toBe(first.firstSeenAt);
  });

  it('keeps different values as separate rows', async () => {
    await store.recordUserSignal({ ...intent, value: a });
    await store.recordUserSignal({ ...intent, value: b });
    expect(await store.getUserSignals('u1')).toHaveLength(2);
  });

  it('keeps signals of different users apart', async () => {
    await store.recordUserSignal({ ...intent, value: a });
    expect(await store.getUserSignals('u2')).toEqual([]);
  });

  it('returns the most recently seen signal first', async () => {
    await store.recordUserSignal({ ...intent, value: a });
    await new Promise(resolve => setTimeout(resolve, 5));
    await store.recordUserSignal({ ...intent, value: b });
    expect((await store.getUserSignals('u1')).map(s => s.value)).toEqual([b, a]);
    await new Promise(resolve => setTimeout(resolve, 5));
    await store.recordUserSignal({ ...intent, value: a });
    expect((await store.getUserSignals('u1')).map(s => s.value)).toEqual([a, b]);
  });

  it('drops a new value once the user has 50 signals', async () => {
    for (let i = 0; i < 50; i++)
      await store.recordUserSignal({ ...intent, value: `{"source":"s-${i}"}` });
    await store.recordUserSignal({ ...intent, value: b });
    expect(await store.getUserSignals('u1')).toHaveLength(50);
  });

  it('still counts an existing value at the limit', async () => {
    for (let i = 0; i < 50; i++)
      await store.recordUserSignal({ ...intent, value: `{"source":"s-${i}"}` });
    await store.recordUserSignal({ ...intent, value: '{"source":"s-0"}' });
    const signals = await store.getUserSignals('u1');
    expect(signals).toHaveLength(50);
    expect(signals.find(s => s.value === '{"source":"s-0"}')?.seenCount).toBe(2);
  });
});
