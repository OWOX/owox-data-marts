import assert from 'node:assert';
import { describe, it } from 'node:test';
import { SyncRetriever } from '../../src/Core/Declarative/SyncRetriever.js';
import { RecordSelector } from '../../src/Core/Declarative/RecordSelector.js';
import { Paginator } from '../../src/Core/Declarative/Paginator.js';

describe('SyncRetriever', () => {
  it('sends one request and extracts records via the selector', async () => {
    const fakeRequester = {
      async send(spec, scope) {
        assert.strictEqual(spec.path, '/data');
        assert.strictEqual(scope.dateWindow.start, '2026-01-01');
        return { data: { rows: [{ a: 1 }, { a: 2 }] } };
      },
    };
    const retriever = new SyncRetriever({
      requester: fakeRequester,
      recordSelector: new RecordSelector({ recordPath: ['data', 'rows'] }),
      requestSpec: { method: 'GET', path: '/data' },
    });

    const records = await retriever.run({ dateWindow: { start: '2026-01-01' } });
    assert.deepStrictEqual(records, [{ a: 1 }, { a: 2 }]);
  });

  it('paginates across pages until the paginator stops', async () => {
    const pages = {
      '/data': { items: [{ a: 1 }, { a: 2 }], cursor: 'C2' },
      '/data?c=C2': { items: [{ a: 3 }], cursor: null },
    };
    const requester = {
      async send(spec) {
        const key = spec.queryParameters?.c ? `/data?c=${spec.queryParameters.c}` : '/data';
        return pages[key];
      },
    };
    const { RecordSelector } = await import('../../src/Core/Declarative/RecordSelector.js');
    const { Paginator } = await import('../../src/Core/Declarative/Paginator.js');
    const retriever = new SyncRetriever({
      requester,
      recordSelector: new RecordSelector({ recordPath: ['items'] }),
      requestSpec: { method: 'GET', path: '/data' },
      paginator: new Paginator({ type: 'cursor', cursorPath: ['cursor'], cursorParam: 'c' }),
    });
    const records = await retriever.run({});
    assert.deepStrictEqual(records, [{ a: 1 }, { a: 2 }, { a: 3 }]);
  });

  it('respects the maxPages cap', async () => {
    let calls = 0;
    const requester = {
      async send() {
        calls++;
        return { items: [{ x: calls }], cursor: 'always' };
      },
    };
    const { RecordSelector } = await import('../../src/Core/Declarative/RecordSelector.js');
    const { Paginator } = await import('../../src/Core/Declarative/Paginator.js');
    const retriever = new SyncRetriever({
      requester,
      recordSelector: new RecordSelector({ recordPath: ['items'] }),
      requestSpec: { method: 'GET', path: '/d' },
      paginator: new Paginator({ type: 'cursor', cursorPath: ['cursor'], cursorParam: 'c' }),
      maxPages: 3,
    });
    const records = await retriever.run({});
    assert.strictEqual(records.length, 3);
    assert.strictEqual(calls, 3);
  });
});

describe('SyncRetriever maxRows', () => {
  it('caps total records at maxRows (slices the final page)', async () => {
    let calls = 0;
    const requester = {
      send: async () => {
        calls += 1;
        return { data: [{ i: calls * 10 + 1 }, { i: calls * 10 + 2 }, { i: calls * 10 + 3 }] };
      },
    };
    const { Paginator } = await import('../../src/Core/Declarative/Paginator.js');
    const r = new SyncRetriever({
      requester,
      recordSelector: new RecordSelector({ recordPath: ['data'] }),
      requestSpec: { method: 'GET', path: '/x' },
      paginator: new Paginator({ type: 'offset', offsetParam: 'offset', pageSize: 3 }),
      maxRows: 5,
    });
    const out = await r.run({});
    assert.strictEqual(out.length, 5);
  });

  it('maxPages still bounds pages independently', async () => {
    const requester = { send: async () => ({ data: [{ i: 1 }, { i: 2 }, { i: 3 }] }) };
    const { Paginator } = await import('../../src/Core/Declarative/Paginator.js');
    const r = new SyncRetriever({
      requester,
      recordSelector: new RecordSelector({ recordPath: ['data'] }),
      requestSpec: { method: 'GET', path: '/x' },
      paginator: new Paginator({ type: 'offset', offsetParam: 'offset', pageSize: 3 }),
      maxPages: 2,
    });
    const out = await r.run({});
    assert.strictEqual(out.length, 6);
  });

  it('without maxRows returns all pages (unchanged default)', async () => {
    let calls = 0;
    const requester = {
      send: async () => {
        calls += 1;
        return { data: calls < 3 ? [{ i: calls }, { i: calls }] : [] };
      },
    };
    const { Paginator } = await import('../../src/Core/Declarative/Paginator.js');
    const r = new SyncRetriever({
      requester,
      recordSelector: new RecordSelector({ recordPath: ['data'] }),
      requestSpec: { method: 'GET', path: '/x' },
      paginator: new Paginator({ type: 'page', pageParam: 'page' }),
    });
    const out = await r.run({});
    assert.strictEqual(out.length, 4);
  });

  it('surfaces response headers to a header-cursor paginator and stops when the header is gone', async () => {
    let call = 0;
    const requester = {
      async send(request, scope, opts) {
        call += 1;
        const body = { rows: [{ id: call }] };
        const headers = { get: n => (n === 'X-Next' && call === 1 ? 'C2' : null) };
        return opts && opts.withHeaders ? { body, headers } : body;
      },
    };
    const recordSelector = new RecordSelector({ recordPath: ['rows'] });
    const paginator = new Paginator({
      type: 'cursor',
      cursor: { from: 'header', header: 'X-Next' },
      inject: { into: 'query', name: 'cursor' },
    });
    const r = new SyncRetriever({
      requester,
      recordSelector,
      requestSpec: { method: 'GET', path: '/x' },
      paginator,
    });
    const out = await r.run({});
    assert.deepStrictEqual(out, [{ id: 1 }, { id: 2 }]); // two pages: header present on page 1, gone on page 2
    assert.strictEqual(call, 2);
  });
});

describe('SyncRetriever http_response trace', () => {
  it('emits http_response TRACE with the per-page record count when context is provided', async () => {
    const events = [];
    const context = { emit: e => events.push(e.toJSON ? e.toJSON() : e) };
    const requester = {
      async send() {
        return { rows: [{ a: 1 }, { a: 2 }, { a: 3 }] };
      },
    };
    const r = new SyncRetriever({
      requester,
      recordSelector: new RecordSelector({ recordPath: ['rows'] }),
      requestSpec: { method: 'GET', path: '/x' },
      context,
    });
    await r.run({});
    const responses = events.filter(e => e.type === 'TRACE' && e.action === 'http_response');
    assert.strictEqual(responses.length, 1);
    assert.strictEqual(responses[0].details.records, 3);
  });

  it('emits one http_response per page across pagination', async () => {
    const events = [];
    const context = { emit: e => events.push(e.toJSON ? e.toJSON() : e) };
    const pages = {
      '/data': { items: [{ a: 1 }, { a: 2 }], cursor: 'C2' },
      '/data?c=C2': { items: [{ a: 3 }], cursor: null },
    };
    const requester = {
      async send(spec) {
        const key = spec.queryParameters?.c ? `/data?c=${spec.queryParameters.c}` : '/data';
        return pages[key];
      },
    };
    const r = new SyncRetriever({
      requester,
      recordSelector: new RecordSelector({ recordPath: ['items'] }),
      requestSpec: { method: 'GET', path: '/data' },
      paginator: new Paginator({ type: 'cursor', cursorPath: ['cursor'], cursorParam: 'c' }),
      context,
    });
    await r.run({});
    const counts = events
      .filter(e => e.type === 'TRACE' && e.action === 'http_response')
      .map(e => e.details.records);
    assert.deepStrictEqual(counts, [2, 1]);
  });

  it('does not throw and emits nothing when no context is provided', async () => {
    const requester = {
      async send() {
        return { rows: [{ a: 1 }] };
      },
    };
    const r = new SyncRetriever({
      requester,
      recordSelector: new RecordSelector({ recordPath: ['rows'] }),
      requestSpec: { method: 'GET', path: '/x' },
    });
    const out = await r.run({});
    assert.deepStrictEqual(out, [{ a: 1 }]);
  });
});

// M2: exiting the loop because the page budget ran out is indistinguishable, in
// the returned value, from the paginator saying stop -- so the node reports
// success and the cursor advances over data that was never fetched. The
// diagnostic must fire for budget exhaustion ONLY, or every naturally-finished
// run would log it too.
describe('SyncRetriever maxPages exhaustion diagnostic', () => {
  // `emit` is stubbed too: the retriever already emits an http_response TRACE per
  // page, and only `log` output is under test here.
  function collectLogs() {
    const logs = [];
    return {
      logs,
      context: { emit: () => {}, log: (level, message) => logs.push({ level, message }) },
    };
  }

  it('logs an INFO diagnostic naming the budget when maxPages cuts a still-paging node short', async () => {
    const { logs, context } = collectLogs();
    let calls = 0;
    const requester = {
      async send() {
        calls++;
        return { items: [{ x: calls }], cursor: 'always' };
      },
    };
    const r = new SyncRetriever({
      requester,
      recordSelector: new RecordSelector({ recordPath: ['items'] }),
      requestSpec: { method: 'GET', path: '/d' },
      paginator: new Paginator({ type: 'cursor', cursorPath: ['cursor'], cursorParam: 'c' }),
      maxPages: 3,
      context,
    });
    const out = await r.run({});

    assert.strictEqual(out.length, 3); // the pages it did get are still returned
    assert.strictEqual(calls, 3);
    assert.strictEqual(logs.length, 1, `expected one diagnostic, got ${JSON.stringify(logs)}`);
    // Same level decision as the IGNORE diagnostic: WARN is the backend's
    // run-failure channel, and a live test run caps maxPages at 1 by default
    // (connector-test.service.ts), so WARN would fail every builder test run.
    assert.strictEqual(logs[0].level, 'info');
    assert.ok(logs[0].message.includes('3'), `budget missing: ${logs[0].message}`);
    assert.ok(logs[0].message.includes('/d'), `path missing: ${logs[0].message}`);
  });

  it('logs nothing when the paginator ends the loop naturally', async () => {
    const { logs, context } = collectLogs();
    const pages = {
      '/data': { items: [{ a: 1 }, { a: 2 }], cursor: 'C2' },
      '/data?c=C2': { items: [{ a: 3 }], cursor: null },
    };
    const requester = {
      async send(spec) {
        const key = spec.queryParameters?.c ? `/data?c=${spec.queryParameters.c}` : '/data';
        return pages[key];
      },
    };
    const r = new SyncRetriever({
      requester,
      recordSelector: new RecordSelector({ recordPath: ['items'] }),
      requestSpec: { method: 'GET', path: '/data' },
      paginator: new Paginator({ type: 'cursor', cursorPath: ['cursor'], cursorParam: 'c' }),
      maxPages: 10,
      context,
    });
    const out = await r.run({});

    assert.strictEqual(out.length, 3);
    assert.deepStrictEqual(logs, []);
  });

  it('logs nothing for an unpaginated node (one page, no paginator)', async () => {
    const { logs, context } = collectLogs();
    const r = new SyncRetriever({
      requester: { send: async () => ({ items: [{ a: 1 }] }) },
      recordSelector: new RecordSelector({ recordPath: ['items'] }),
      requestSpec: { method: 'GET', path: '/one' },
      maxPages: 1,
      context,
    });
    await r.run({});
    assert.deepStrictEqual(logs, []);
  });

  it('logs nothing when maxRows (not maxPages) ends the loop', async () => {
    const { logs, context } = collectLogs();
    const r = new SyncRetriever({
      requester: { send: async () => ({ data: [{ i: 1 }, { i: 2 }, { i: 3 }] }) },
      recordSelector: new RecordSelector({ recordPath: ['data'] }),
      requestSpec: { method: 'GET', path: '/x' },
      paginator: new Paginator({ type: 'offset', offsetParam: 'offset', pageSize: 3 }),
      maxRows: 5,
      context,
    });
    const out = await r.run({});
    assert.strictEqual(out.length, 5);
    assert.deepStrictEqual(logs, []);
  });
});

// M5: a single "page" can be a whole file -- responseFormat csv/jsonl decode a
// 64 MiB body into one flat array, ~670k records at 100 bytes/row -- and
// `all.push(...records)` passes every record as a separate argument, blowing
// V8's spread-argument limit (~125k) with
// "RangeError: Maximum call stack size exceeded".
describe('SyncRetriever accumulates large pages without spreading', () => {
  // Programmatic and tiny: 200k one-key objects, no 64 MiB of strings.
  const BULK = 200000;
  const bulkPage = () => ({ rows: Array.from({ length: BULK }, (_, i) => ({ i })) });

  it('accumulates a page far past the spread-argument limit', async () => {
    const r = new SyncRetriever({
      requester: { send: async () => bulkPage() },
      recordSelector: new RecordSelector({ recordPath: ['rows'] }),
      requestSpec: { method: 'GET', path: '/bulk' },
    });
    const out = await r.run({});
    assert.strictEqual(out.length, BULK);
    assert.strictEqual(out[0].i, 0);
    assert.strictEqual(out[BULK - 1].i, BULK - 1);
  });

  it('accumulates bulk pages across pagination', async () => {
    let calls = 0;
    const r = new SyncRetriever({
      requester: {
        async send() {
          calls++;
          return { ...bulkPage(), cursor: calls === 1 ? 'C2' : null };
        },
      },
      recordSelector: new RecordSelector({ recordPath: ['rows'] }),
      requestSpec: { method: 'GET', path: '/bulk' },
      paginator: new Paginator({ type: 'cursor', cursorPath: ['cursor'], cursorParam: 'c' }),
    });
    const out = await r.run({});
    assert.strictEqual(out.length, BULK * 2);
    assert.strictEqual(calls, 2);
  });

  it('still truncates a bulk page at exactly maxRows', async () => {
    const r = new SyncRetriever({
      requester: { send: async () => bulkPage() },
      recordSelector: new RecordSelector({ recordPath: ['rows'] }),
      requestSpec: { method: 'GET', path: '/bulk' },
      maxRows: 7,
    });
    const out = await r.run({});
    assert.strictEqual(out.length, 7);
    assert.deepStrictEqual(
      out.map(r2 => r2.i),
      [0, 1, 2, 3, 4, 5, 6]
    );
  });

  it('truncates at exactly maxRows across a page boundary', async () => {
    let calls = 0;
    const r = new SyncRetriever({
      requester: {
        async send() {
          calls++;
          return { rows: [{ i: calls * 10 + 1 }, { i: calls * 10 + 2 }, { i: calls * 10 + 3 }] };
        },
      },
      recordSelector: new RecordSelector({ recordPath: ['rows'] }),
      requestSpec: { method: 'GET', path: '/x' },
      paginator: new Paginator({ type: 'offset', offsetParam: 'offset', pageSize: 3 }),
      maxRows: 4,
    });
    const out = await r.run({});
    assert.deepStrictEqual(
      out.map(r2 => r2.i),
      [11, 12, 13, 21]
    );
    assert.strictEqual(calls, 2);
  });
});
