import assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { DeclarativeSource } from '../../src/Core/Declarative/DeclarativeSource.js';
import { ManifestParser } from '../../src/Core/Declarative/ManifestParser.js';
import { AbstractContext } from '../../src/Core/AbstractContext.js';

const LIST = { type: 'list', values: ['a', 'b', 'c', 'd', 'e'], partitionField: 'slice' };
const SUBSTREAM = {
  type: 'substream',
  parent: { request: { method: 'GET', path: '/pages' }, recordPath: ['data'], key: 'id' },
  partitionField: 'slice',
};

const manifest = (node = {}, top = {}, moreNodes = {}) =>
  JSON.stringify({
    version: '1.0',
    name: 'Sliced',
    baseUrl: 'https://api.example.com',
    ...top,
    authentication: { type: 'apiKey', inject: { into: 'query', name: 'k', format: 'x' } },
    parameters: {
      Region: { requiredType: 'string' },
      GeneratedRefreshToken: { requiredType: 'string' },
    },
    nodes: {
      stats: {
        destinationName: 'stats',
        isTimeSeries: false,
        uniqueKeys: ['id'],
        fields: { id: { dataPath: 'id', type: 'string' }, n: { dataPath: 'n', type: 'integer' } },
        partitionRouter: LIST,
        request: { method: 'GET', path: '/stats/{{ stream_slice.slice }}' },
        recordSelector: { recordPath: ['rows'] },
        ...node,
      },
      ...moreNodes,
    },
  });

describe('DeclarativeSource slice checkpoint', () => {
  let originalFetch;
  let urls;
  let parentIds;
  let clock;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    urls = [];
    parentIds = ['a', 'b', 'c', 'd', 'e'];
    clock = { now: 0, perRequest: 0 };
    globalThis.fetch = async url => {
      const u = String(url);
      urls.push(u);
      clock.now += clock.perRequest;
      const slice = u.match(/\/stats\/([^/?]+)/)?.[1];
      // Fresh objects per call: a shared body would share records between slices.
      const body = slice
        ? {
            rows: [
              { id: `${slice}1`, n: '1', keep: 'yes' },
              { id: `${slice}2`, n: '2', keep: 'no' },
            ],
          }
        : { data: parentIds.map(id => ({ id })) };
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => body };
    };
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const childUrls = () => urls.filter(u => u.includes('/stats/'));
  const slicesRead = () => childUrls().map(u => u.match(/\/stats\/([^/?]+)/)[1]);

  function attempt({
    state = {},
    runId = 'run-1',
    region = 'eu',
    token = 'r1',
    node,
    options,
    fields = ['id', 'n'],
    batch = { rows: 4, ms: 60000 },
    onBatch,
    noBatch = false,
    top,
    moreNodes,
    destination,
  } = {}) {
    const context = new AbstractContext({
      source: {
        name: 'Sliced',
        config: { Region: { value: region }, GeneratedRefreshToken: { value: token } },
      },
      storage: { name: 'Mock', config: {} },
      runConfig: { type: 'INCREMENTAL', data: [], state },
      env: { datamartId: 'dm', runId },
    });
    if (destination) context.storageConfig.DestinationTableName = { value: destination };
    const events = [];
    context.emit = e => events.push(JSON.parse(JSON.stringify(e.toJSON())));
    const source = new DeclarativeSource(
      context,
      new ManifestParser().parse(manifest(node, top, moreNodes)),
      options
    );
    source._delay = () => Promise.resolve();
    source._now = () => clock.now;
    const batches = [];
    const run = (nodeName = 'stats') =>
      source.fetchData({
        nodeName,
        fields,
        accountId: null,
        startDate: null,
        endDate: null,
        batch,
        onBatch: noBatch
          ? undefined
          : onBatch ||
            (async rows => {
              batches.push(rows.map(r => r.id));
            }),
      });
    const checkpoints = () =>
      events.filter(e => e.type === 'STATE').map(e => e.state.sliceCheckpoint);
    const logs = () => events.filter(e => e.type === 'LOG').map(e => e.message);
    return { context, source, events, batches, run, checkpoints, logs };
  }

  // Runs attempt 1 until its second write fails, as a stop mid-node does.
  async function interrupted(options = {}) {
    let calls = 0;
    const first = attempt({
      ...options,
      onBatch: async () => {
        calls += 1;
        if (calls === 2) throw new Error('stopped');
      },
    });
    await assert.rejects(first.run(), /stopped/);
    return first.checkpoints().at(-1);
  }

  it('writes a batch when the buffer reaches the row threshold, and the rest at the end', async () => {
    const { run, batches, checkpoints } = attempt();

    assert.deepStrictEqual(await run(), []);

    assert.deepStrictEqual(batches, [
      ['a1', 'a2', 'b1', 'b2'],
      ['c1', 'c2', 'd1', 'd2'],
      ['e1', 'e2'],
    ]);
    const [scope] = checkpoints().at(-1).done;
    assert.deepStrictEqual(checkpoints(), [
      {
        runId: 'run-1',
        done: [],
        current: { scope, slices: 5, hash: checkpoints()[0].current.hash, next: 2 },
      },
      {
        runId: 'run-1',
        done: [],
        current: { scope, slices: 5, hash: checkpoints()[0].current.hash, next: 4 },
      },
      { runId: 'run-1', done: [scope], current: null },
    ]);
    assert.match(scope, /^stats\|\|\|\|[0-9a-f]{8}$/);
    assert.match(checkpoints()[0].current.hash, /^[0-9a-f]{8}$/);
  });

  it('writes a batch when the time threshold passed since the last checkpoint', async () => {
    clock.perRequest = 600;
    const { run, batches, checkpoints } = attempt({ batch: { rows: 100, ms: 1000 } });

    await run();

    assert.deepStrictEqual(batches, [
      ['a1', 'a2', 'b1', 'b2'],
      ['c1', 'c2', 'd1', 'd2'],
      ['e1', 'e2'],
    ]);
    assert.deepStrictEqual(
      checkpoints().map(c => c.current?.next ?? null),
      [2, 4, null]
    );
  });

  it('sends only the checkpoint when the time threshold passes with an empty buffer', async () => {
    clock.perRequest = 600;
    const { run, batches, checkpoints } = attempt({
      batch: { rows: 100, ms: 1000 },
      node: { recordFilter: { path: ['keep'], operator: 'equals', value: 'never' } },
    });

    await run();

    assert.deepStrictEqual(batches, []);
    assert.deepStrictEqual(
      checkpoints().map(c => c.current?.next ?? null),
      [2, 4, null]
    );
  });

  it('sends the checkpoint only after the write resolves', async () => {
    let release;
    let calls = 0;
    const { run, checkpoints } = attempt({
      onBatch: () => {
        calls += 1;
        return calls === 1 ? new Promise(resolve => (release = resolve)) : Promise.resolve();
      },
    });

    const running = run();
    for (let i = 0; !release && i < 1000; i++) await new Promise(r => setImmediate(r));
    assert.ok(release, 'onBatch was not called');
    assert.deepStrictEqual(checkpoints(), []);
    release();
    await running;

    assert.strictEqual(checkpoints()[0].current.next, 2);
  });

  it('sends no checkpoint and rejects when a write fails', async () => {
    const { run, checkpoints } = attempt({
      onBatch: async () => {
        throw new Error('storage down');
      },
    });

    await assert.rejects(run(), /storage down/);

    assert.deepStrictEqual(checkpoints(), []);
  });

  it('resumes at the slice after the last written batch', async () => {
    const saved = await interrupted();
    assert.strictEqual(saved.current.next, 2);
    urls = [];

    const second = attempt({ state: { sliceCheckpoint: saved } });
    await second.run();

    assert.deepStrictEqual(slicesRead(), ['c', 'd', 'e']);
    assert.deepStrictEqual(second.batches, [
      ['c1', 'c2', 'd1', 'd2'],
      ['e1', 'e2'],
    ]);
    // next counts from the first slice of the list, not from the resume point.
    assert.strictEqual(second.checkpoints()[0].current.next, 4);
    assert.ok(
      second
        .logs()
        .includes(
          'Node "stats": resuming at slice 3 of 5. An earlier attempt of this run loaded the ' +
            'slices before it.'
        )
    );
    assert.deepStrictEqual(second.checkpoints().at(-1), {
      runId: 'run-1',
      done: [saved.current.scope],
      current: null,
    });
  });

  it('reads the parent list again on resume and resumes a substream node', async () => {
    const saved = await interrupted({ node: { partitionRouter: SUBSTREAM } });
    urls = [];

    const second = attempt({
      state: { sliceCheckpoint: saved },
      node: { partitionRouter: SUBSTREAM },
    });
    await second.run();

    assert.strictEqual(urls.filter(u => u.includes('/pages')).length, 1);
    assert.deepStrictEqual(slicesRead(), ['c', 'd', 'e']);
  });

  it('reads from the first slice when the parent list changed', async () => {
    const saved = await interrupted({ node: { partitionRouter: SUBSTREAM } });
    urls = [];
    parentIds = ['e', 'd', 'c', 'b', 'a'];

    const second = attempt({
      state: { sliceCheckpoint: saved },
      node: { partitionRouter: SUBSTREAM },
    });
    await second.run();

    assert.deepStrictEqual(slicesRead(), ['e', 'd', 'c', 'b', 'a']);
    assert.ok(!second.logs().some(m => /resuming/.test(m)));
  });

  it('makes no request for a scope the run already loaded, and logs it', async () => {
    const first = attempt();
    await first.run();
    urls = [];

    const second = attempt({ state: { sliceCheckpoint: first.checkpoints().at(-1) } });
    assert.deepStrictEqual(await second.run(), []);

    assert.deepStrictEqual(urls, []);
    assert.deepStrictEqual(second.batches, []);
    assert.deepStrictEqual(second.checkpoints(), []);
    assert.deepStrictEqual(second.logs(), [
      'Node "stats": an earlier attempt of this run already loaded it. Skipped.',
    ]);
  });

  it('names the account in the skip line', async () => {
    const first = attempt();
    const fetchFor = (source, onBatch) =>
      source.fetchData({
        nodeName: 'stats',
        fields: ['id', 'n'],
        accountId: 'acc-7',
        startDate: '2026-11-01',
        endDate: '2026-11-19',
        batch: { rows: 4, ms: 60000 },
        onBatch,
      });
    await fetchFor(first.source, async () => {});
    const saved = first.checkpoints().at(-1);
    assert.match(saved.done[0], /^stats\|acc-7\|2026-11-01\|2026-11-19\|[0-9a-f]{8}$/);

    const second = attempt({ state: { sliceCheckpoint: saved } });
    await fetchFor(second.source, async () => {});

    assert.deepStrictEqual(second.logs(), [
      'Node "stats" (account acc-7): an earlier attempt of this run already loaded it. Skipped.',
    ]);
  });

  it('names the account in the resume line', async () => {
    let calls = 0;
    const fetchFor = (source, onBatch) =>
      source.fetchData({
        nodeName: 'stats',
        fields: ['id', 'n'],
        accountId: 'acc-7',
        startDate: '2026-11-01',
        endDate: '2026-11-19',
        batch: { rows: 4, ms: 60000 },
        onBatch,
      });
    const first = attempt();
    await assert.rejects(
      fetchFor(first.source, async () => {
        calls += 1;
        if (calls === 2) throw new Error('stopped');
      }),
      /stopped/
    );

    const second = attempt({ state: { sliceCheckpoint: first.checkpoints().at(-1) } });
    await fetchFor(second.source, async () => {});

    assert.deepStrictEqual(second.logs(), [
      'Node "stats" (account acc-7): resuming at slice 3 of 5. An earlier attempt of this run ' +
        'loaded the slices before it.',
    ]);
  });

  for (const [what, batch] of [
    ['has no ms', { rows: 4 }],
    ['is null', null],
  ]) {
    it(`falls back to the default batch values when batch ${what}`, async () => {
      const { run, batches } = attempt({ batch });

      await run();

      assert.deepStrictEqual(
        batches.flat().length,
        10,
        'every row is written, with the default for the missing value'
      );
      if (batch) assert.strictEqual(batches.length, 3);
      else assert.strictEqual(batches.length, 1);
    });
  }

  it('reads from the first slice when the checkpoint belongs to another run', async () => {
    const saved = await interrupted();
    urls = [];

    const second = attempt({ state: { sliceCheckpoint: saved }, runId: 'run-2' });
    await second.run();

    assert.deepStrictEqual(slicesRead(), ['a', 'b', 'c', 'd', 'e']);
    assert.deepStrictEqual(second.checkpoints().at(-1), {
      runId: 'run-2',
      done: [saved.current.scope],
      current: null,
    });
  });

  for (const [what, change] of [
    ['a selected field', { fields: ['id'] }],
    ['a parameter value', { region: 'us' }],
  ]) {
    it(`reads the node again when ${what} changed between attempts`, async () => {
      const first = attempt();
      await first.run();
      urls = [];

      const second = attempt({ state: { sliceCheckpoint: first.checkpoints().at(-1) }, ...change });
      await second.run();

      assert.deepStrictEqual(slicesRead(), ['a', 'b', 'c', 'd', 'e']);
      assert.strictEqual(second.checkpoints().at(-1).done.length, 2);
    });
  }

  it('skips a loaded node after the refresh token rotated', async () => {
    const first = attempt();
    await first.run();
    urls = [];

    const second = attempt({ state: { sliceCheckpoint: first.checkpoints().at(-1) }, token: 'r2' });
    await second.run();

    assert.deepStrictEqual(urls, []);
  });

  it('reads from the first slice when the slice count or hash does not match', async () => {
    const saved = await interrupted();
    for (const current of [
      { ...saved.current, hash: '00000000' },
      { ...saved.current, slices: 4 },
    ]) {
      urls = [];
      await attempt({ state: { sliceCheckpoint: { ...saved, current } } }).run();
      assert.deepStrictEqual(slicesRead(), ['a', 'b', 'c', 'd', 'e']);
    }
  });

  it('ignores a malformed checkpoint', async () => {
    const saved = await interrupted();
    for (const sliceCheckpoint of [
      'oops',
      null,
      [],
      { runId: 'run-1', done: 'x', current: null },
      { runId: 'run-1', done: [1], current: null },
      { runId: 'run-1', done: [], current: { ...saved.current, next: 6 } },
      { runId: 'run-1', done: [], current: { ...saved.current, next: -1 } },
      { runId: 'run-1', done: [], current: { ...saved.current, next: '2' } },
      { runId: 'run-1', done: [], current: { ...saved.current, hash: 7 } },
      { runId: 'run-1', done: [], current: 'x' },
    ]) {
      urls = [];
      const next = attempt({ state: { sliceCheckpoint } });
      await next.run();
      assert.deepStrictEqual(
        slicesRead(),
        ['a', 'b', 'c', 'd', 'e'],
        JSON.stringify(sliceCheckpoint)
      );
      assert.deepStrictEqual(next.checkpoints().at(-1).done, [saved.current.scope]);
    }
  });

  it('keeps the checkpoint within 8 KiB: a scope that would pass it is not marked done', async () => {
    // 8184 bytes as saved; one more done scope (20 bytes) passes 8192.
    const big = 'x'.repeat(8140);
    const { run, checkpoints } = attempt({
      state: { sliceCheckpoint: { runId: 'run-1', done: [big], current: null } },
    });

    await run();

    assert.deepStrictEqual(checkpoints().at(-1), { runId: 'run-1', done: [big], current: null });
    assert.ok(JSON.stringify(checkpoints().at(-1)).length <= 8192);
  });

  for (const [what, setup] of [
    ['emitSample is set', { options: { emitSample: true } }],
    ['the run has no id', { runId: null }],
    ['the engine passes no onBatch', { noBatch: true }],
  ]) {
    it(`keeps the single read when ${what}`, async () => {
      const { run, batches, events } = attempt(setup);

      const rows = await run();

      assert.deepStrictEqual(
        rows.map(r => r.id),
        ['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'd1', 'd2', 'e1', 'e2']
      );
      assert.deepStrictEqual(batches, []);
      assert.ok(!events.some(e => e.type === 'STATE'));
      assert.strictEqual(
        events.filter(e => e.type === 'SAMPLE').length,
        setup.options?.emitSample ? 1 : 0
      );
    });
  }

  it('returns the records of a node without a partition router and sends no checkpoint', async () => {
    const { run, batches, events } = attempt({
      node: { partitionRouter: undefined, request: { method: 'GET', path: '/stats/all' } },
    });

    const rows = await run();

    assert.deepStrictEqual(
      rows.map(r => r.id),
      ['all1', 'all2']
    );
    assert.deepStrictEqual(batches, []);
    assert.ok(!events.some(e => e.type === 'STATE'));
  });

  it('processes each slice like the single read: filter, transformations and cast', async () => {
    const node = {
      recordFilter: { path: ['keep'], operator: 'equals', value: 'yes' },
      transformations: [
        { type: 'add', field: 'id', value: '{{ parameters.Region }}-{{ record.id }}' },
        { type: 'remove', field: 'keep' },
      ],
    };
    const single = await attempt({ node, noBatch: true }).run();
    const written = [];
    await attempt({
      node,
      batch: { rows: 2, ms: 60000 },
      onBatch: async rows => {
        written.push(...rows);
      },
    }).run();

    assert.deepStrictEqual(written, single);
    assert.deepStrictEqual(single, [
      { id: 'eu-a1', n: 1 },
      { id: 'eu-b1', n: 1 },
      { id: 'eu-c1', n: 1 },
      { id: 'eu-d1', n: 1 },
      { id: 'eu-e1', n: 1 },
    ]);
  });

  it('counts extracted rows once per write', async () => {
    const { run, events } = attempt();

    await run();

    assert.deepStrictEqual(
      events.filter(e => e.type === 'ANALYTICS' && e.metric === 'rows_extracted').map(e => e.value),
      [4, 4, 2]
    );
  });

  it('does not report an empty node for a node the checkpoint skipped', async () => {
    const first = attempt();
    await first.run();
    const saved = await interrupted();

    const skipped = attempt({ state: { sliceCheckpoint: first.checkpoints().at(-1) } });
    await skipped.run();
    skipped.source.onImportComplete(skipped.context);

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ rows: [] }),
    });
    const resumed = attempt({ state: { sliceCheckpoint: saved } });
    await resumed.run();
    resumed.source.onImportComplete(resumed.context);

    for (const { logs } of [skipped, resumed]) {
      assert.ok(!logs().some(m => /No records came back/.test(m)), logs().join('\n'));
    }
  });

  it('does not report an empty node when one account is skipped and another returns no rows', async () => {
    const fetchFor = (source, accountId) =>
      source.fetchData({
        nodeName: 'stats',
        fields: ['id', 'n'],
        accountId,
        startDate: null,
        endDate: null,
        batch: { rows: 4, ms: 60000 },
        onBatch: async () => {},
      });
    const first = attempt();
    await fetchFor(first.source, 'A');
    const saved = first.checkpoints().at(-1);

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ rows: [] }),
    });
    const second = attempt({ state: { sliceCheckpoint: saved } });
    await fetchFor(second.source, 'A');
    await fetchFor(second.source, 'B');
    second.source.onImportComplete(second.context);

    assert.ok(!second.logs().some(m => /No records came back/.test(m)), second.logs().join('\n'));
  });

  it('still reports an empty node that the checkpoint did not skip', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ rows: [] }),
    });
    const { run, source, context, logs } = attempt();

    await run();
    source.onImportComplete(context);

    assert.ok(logs().some(m => /No records came back for node "stats"/.test(m)));
  });
  it('does not mark a scope done when its tail write fails', async () => {
    let calls = 0;
    const first = attempt({
      onBatch: async () => {
        calls += 1;
        if (calls === 3) throw new Error('tail down');
      },
    });

    await assert.rejects(first.run(), /tail down/);

    const last = first.checkpoints().at(-1);
    assert.deepStrictEqual(last.done, []);
    assert.strictEqual(last.current.next, 4);
  });

  it('resumes with no child request when the saved slice position is the end', async () => {
    const first = attempt();
    await first.run();
    const done = first.checkpoints().at(-1);
    const hash = first.checkpoints()[0].current.hash;
    const saved = {
      runId: 'run-1',
      done: [],
      current: { scope: done.done[0], slices: 5, hash, next: 5 },
    };
    urls = [];

    const second = attempt({ state: { sliceCheckpoint: saved } });
    await second.run();

    assert.deepStrictEqual(childUrls(), []);
    assert.deepStrictEqual(second.checkpoints().at(-1).done, done.done);
  });

  it('reads every slice when the date window changed', async () => {
    const fetchFor = (source, endDate) =>
      source.fetchData({
        nodeName: 'stats',
        fields: ['id', 'n'],
        accountId: null,
        startDate: '2026-11-01',
        endDate,
        batch: { rows: 4, ms: 60000 },
        onBatch: async () => {},
      });
    const first = attempt();
    await fetchFor(first.source, '2026-11-19');
    urls = [];

    const second = attempt({ state: { sliceCheckpoint: first.checkpoints().at(-1) } });
    await fetchFor(second.source, '2026-11-20');

    assert.deepStrictEqual(slicesRead(), ['a', 'b', 'c', 'd', 'e']);
  });

  it('skips a finished node and resumes another', async () => {
    const other = { ...JSON.parse(manifest()).nodes.stats, destinationName: 'other' };
    const opts = { moreNodes: { other } };
    let calls = 0;
    const first = attempt({
      ...opts,
      onBatch: async () => {
        calls += 1;
        if (calls === 5) throw new Error('stopped');
      },
    });
    await first.run('other');
    await assert.rejects(first.run('stats'), /stopped/);
    const saved = first.checkpoints().at(-1);
    assert.strictEqual(saved.done.length, 1);
    urls = [];

    const second = attempt({ ...opts, state: { sliceCheckpoint: saved } });
    await second.run('other');
    await second.run('stats');

    assert.deepStrictEqual(slicesRead(), ['c', 'd', 'e']);
    assert.strictEqual(second.checkpoints().at(-1).done.length, 2);
  });

  it('resumes the saved account after another account read from the start', async () => {
    const fetchFor = (source, accountId, onBatch) =>
      source.fetchData({
        nodeName: 'stats',
        fields: ['id', 'n'],
        accountId,
        startDate: null,
        endDate: null,
        batch: { rows: 4, ms: 60000 },
        onBatch,
      });
    const first = attempt();
    let calls = 0;
    await assert.rejects(
      fetchFor(first.source, 'A2', async () => {
        calls += 1;
        if (calls === 2) throw new Error('stopped');
      }),
      /stopped/
    );
    const saved = first.checkpoints().at(-1);
    urls = [];

    const second = attempt({ state: { sliceCheckpoint: saved } });
    await fetchFor(second.source, 'A1', async () => {});
    const afterA1 = slicesRead();
    urls = [];
    await fetchFor(second.source, 'A2', async () => {});

    assert.deepStrictEqual(afterA1, ['a', 'b', 'c', 'd', 'e']);
    assert.deepStrictEqual(slicesRead(), ['c', 'd', 'e']);
  });

  it('reads a repeated scope of a fresh attempt both times, with one done entry', async () => {
    const second = attempt();

    await second.run();
    await second.run();

    assert.deepStrictEqual(slicesRead(), [
      ...['a', 'b', 'c', 'd', 'e'],
      ...['a', 'b', 'c', 'd', 'e'],
    ]);
    assert.ok(!second.logs().some(m => /earlier attempt/.test(m)));
    assert.strictEqual(second.checkpoints().at(-1).done.length, 1);
  });

  for (const [what, change] of [
    ['the destination table', { destination: 'other_table' }],
    ['a manifest field outside the nodes', { top: { baseUrl: 'https://api2.example.com' } }],
  ]) {
    it(`reads the node again when ${what} changed between attempts`, async () => {
      const first = attempt({ destination: 'stats' });
      await first.run();
      urls = [];

      const second = attempt({
        state: { sliceCheckpoint: first.checkpoints().at(-1) },
        destination: 'stats',
        ...change,
      });
      await second.run();

      assert.strictEqual(childUrls().length, 5);
    });
  }

  it('counts no rows for a batch whose write failed', async () => {
    const { run, events } = attempt({
      onBatch: async () => {
        throw new Error('storage down');
      },
    });

    await assert.rejects(run(), /storage down/);

    assert.deepStrictEqual(
      events.filter(e => JSON.stringify(e).includes('rows_extracted')),
      []
    );
  });
});
