import assert from 'node:assert';
import { describe, it } from 'node:test';
import { Paginator } from '../../src/Core/Declarative/Paginator.js';
import { SyncRetriever } from '../../src/Core/Declarative/SyncRetriever.js';
import { RecordSelector } from '../../src/Core/Declarative/RecordSelector.js';
import { isOpaque, unwrapOpaque } from '../../src/Core/Declarative/opaqueValue.js';

const baseReq = { method: 'GET', path: '/x', queryParameters: { base: 'USD' } };

// Every value the Paginator injects is wrapped as OPAQUE so the Requester
// substitutes it as a literal instead of rendering it against a scope holding
// every secret (see opaqueValue.js). These unit tests therefore read the
// injected value through unwrapOpaque; the end-to-end proof that the marker
// actually blocks exfiltration lives in DeclarativeSecurity.test.js.

describe('Paginator', () => {
  it('none: always returns null (single page)', () => {
    const p = new Paginator({ type: 'none' });
    assert.strictEqual(p.next({ response: { rows: [1] }, request: baseReq, recordCount: 1 }), null);
  });

  it('none by default when no config', () => {
    const p = new Paginator();
    assert.strictEqual(p.next({ response: {}, request: baseReq, recordCount: 5 }), null);
  });

  it('cursor: follows cursorPath into a query param until cursor is absent', () => {
    const p = new Paginator({
      type: 'cursor',
      cursorPath: ['paging', 'next'],
      cursorParam: 'after',
    });
    const r1 = p.next({ response: { paging: { next: 'C2' } }, request: baseReq, recordCount: 10 });
    assert.strictEqual(r1.queryParameters.base, 'USD');
    assert.strictEqual(unwrapOpaque(r1.queryParameters.after), 'C2');
    const r2 = p.next({ response: { paging: {} }, request: r1, recordCount: 3 });
    assert.strictEqual(r2, null);
  });

  it('offset: advances by pageSize until a short page', () => {
    const p = new Paginator({ type: 'offset', offsetParam: 'offset', pageSize: 100 });
    const r1 = p.next({ response: {}, request: baseReq, recordCount: 100 });
    assert.strictEqual(unwrapOpaque(r1.queryParameters.offset), '100');
    const r2 = p.next({ response: {}, request: r1, recordCount: 100 });
    assert.strictEqual(unwrapOpaque(r2.queryParameters.offset), '200');
    const r3 = p.next({ response: {}, request: r2, recordCount: 42 });
    assert.strictEqual(r3, null);
  });

  it('page: increments page number until an empty page', () => {
    const p = new Paginator({ type: 'page', pageParam: 'page', startPage: 1 });
    const r1 = p.next({ response: {}, request: baseReq, recordCount: 50 });
    assert.strictEqual(unwrapOpaque(r1.queryParameters.page), '2');
    const r2 = p.next({ response: {}, request: r1, recordCount: 0 });
    assert.strictEqual(r2, null);
  });

  it('does not mutate the input request', () => {
    const p = new Paginator({ type: 'offset', offsetParam: 'offset', pageSize: 10 });
    p.next({ response: {}, request: baseReq, recordCount: 10 });
    assert.deepStrictEqual(baseReq.queryParameters, { base: 'USD' });
  });

  it('inject into header instead of query', () => {
    const p = new Paginator({
      type: 'cursor',
      cursor: { from: 'body', path: ['next'] },
      inject: { into: 'header', name: 'X-Cursor' },
    });
    const r = p.next({ response: { next: 'C2' }, request: baseReq, recordCount: 5 });
    assert.strictEqual(unwrapOpaque(r.headers['X-Cursor']), 'C2');
    assert.deepStrictEqual(r.queryParameters, { base: 'USD' }); // query untouched
  });

  it('inject into a body path (deep-set, no mutation of the original)', () => {
    const req = { method: 'POST', path: '/gql', body: { query: 'Q', variables: { first: 25 } } };
    const p = new Paginator({
      type: 'cursor',
      cursor: { from: 'body', path: ['data', 'pageInfo', 'endCursor'] },
      inject: { into: 'body', path: ['variables', 'after'] },
    });
    const r = p.next({
      response: { data: { pageInfo: { endCursor: 'CUR' } } },
      request: req,
      recordCount: 25,
    });
    assert.strictEqual(unwrapOpaque(r.body.variables.after), 'CUR');
    assert.strictEqual(r.body.variables.first, 25);
    assert.strictEqual(req.body.variables.after, undefined); // original untouched
  });

  it('inject into path: relative sets path, absolute sets url', () => {
    const pRel = new Paginator({
      type: 'cursor',
      cursor: { from: 'body', path: ['next'] },
      inject: { into: 'path' },
    });
    const rRel = pRel.next({
      response: { next: '/v2/items?page=2' },
      request: baseReq,
      recordCount: 5,
    });
    assert.strictEqual(unwrapOpaque(rRel.path), '/v2/items?page=2');
    const pAbs = new Paginator({
      type: 'cursor',
      cursor: { from: 'body', path: ['next'] },
      inject: { into: 'path' },
    });
    const rAbs = pAbs.next({
      response: { next: 'https://api.example.com/v2/items?page=2' },
      request: baseReq,
      recordCount: 5,
    });
    assert.strictEqual(unwrapOpaque(rAbs.url), 'https://api.example.com/v2/items?page=2');
  });

  it('cursor from a response header', () => {
    const p = new Paginator({
      type: 'cursor',
      cursor: { from: 'header', header: 'X-Next' },
      inject: { into: 'query', name: 'cursor' },
    });
    const headers = { get: n => (n === 'X-Next' ? 'C2' : null) };
    const r = p.next({ response: {}, headers, request: baseReq, recordCount: 5 });
    assert.strictEqual(unwrapOpaque(r.queryParameters.cursor), 'C2');
    const r2 = p.next({ response: {}, headers: { get: () => null }, request: r, recordCount: 5 });
    assert.strictEqual(r2, null); // header absent → stop
  });

  it('cursor from a Link header parses rel="next"', () => {
    const p = new Paginator({
      type: 'cursor',
      cursor: { from: 'header', header: 'Link', linkRel: 'next' },
      inject: { into: 'path' },
    });
    const link =
      '<https://api.example.com/x?page=1>; rel="prev", <https://api.example.com/x?page=3>; rel="next"';
    const r = p.next({
      response: {},
      headers: { get: n => (n === 'Link' ? link : null) },
      request: baseReq,
      recordCount: 5,
    });
    assert.strictEqual(unwrapOpaque(r.url), 'https://api.example.com/x?page=3');
  });

  it('needsHeaders is true only for a header cursor', () => {
    assert.strictEqual(
      new Paginator({ type: 'cursor', cursor: { from: 'header', header: 'X' } }).needsHeaders(),
      true
    );
    assert.strictEqual(
      new Paginator({ type: 'cursor', cursorPath: ['n'], cursorParam: 'c' }).needsHeaders(),
      false
    );
    assert.strictEqual(new Paginator({ type: 'page', pageParam: 'p' }).needsHeaders(), false);
  });

  it('stopCondition halts when the body field matches, continues otherwise', () => {
    const cfg = {
      type: 'cursor',
      cursor: { from: 'body', path: ['endCursor'] },
      inject: { into: 'body', path: ['after'] },
      stopCondition: { path: ['pageInfo', 'hasNextPage'], equals: false },
    };
    const pStop = new Paginator(cfg);
    assert.strictEqual(
      pStop.next({
        response: { endCursor: 'C', pageInfo: { hasNextPage: false } },
        request: { body: {} },
        recordCount: 5,
      }),
      null
    );
    const pGo = new Paginator(cfg);
    const r = pGo.next({
      response: { endCursor: 'C', pageInfo: { hasNextPage: true } },
      request: { body: {} },
      recordCount: 5,
    });
    assert.strictEqual(unwrapOpaque(r.body.after), 'C');
  });

  it('inject query without an explicit name falls back to the legacy *Param', () => {
    const p = new Paginator({
      type: 'cursor',
      cursorParam: 'after',
      cursor: { from: 'body', path: ['next'] },
      inject: { into: 'query' },
    });
    const r = p.next({ response: { next: 'C2' }, request: baseReq, recordCount: 5 });
    assert.strictEqual(unwrapOpaque(r.queryParameters.after), 'C2');
    assert.strictEqual(r.queryParameters.undefined, undefined);
  });

  it('marks every injected value opaque, whatever the inject target', () => {
    const cursor = { from: 'body', path: ['next'] };
    const response = { next: 'C2' };
    const cases = [
      [{ into: 'query', name: 'after' }, r => r.queryParameters.after],
      [{ into: 'header', name: 'X-Cursor' }, r => r.headers['X-Cursor']],
      [{ into: 'body', path: ['after'] }, r => r.body.after],
      [{ into: 'path' }, r => r.path],
    ];
    for (const [inject, read] of cases) {
      const p = new Paginator({ type: 'cursor', cursor, inject });
      const r = p.next({ response, request: { ...baseReq, body: {} }, recordCount: 5 });
      assert.ok(
        isOpaque(read(r)),
        `inject.into "${inject.into}" must mark the injected value opaque so the ` +
          `Requester cannot render an upstream-chosen cursor against the secret scope`
      );
    }
  });
});

describe('Paginator iteration budget (via SyncRetriever.maxPages)', () => {
  // Paginator.next() itself never loops — it returns one "next request" per call.
  // The iteration budget lives in SyncRetriever's driving loop
  // (`pages < this.maxPages`), which applies identically regardless of
  // paginator.type. These tests prove a `page` API and a `cursor` API that
  // would otherwise run forever both stop at maxPages — i.e. `cursor` already
  // has the same independent iteration cap as `page`/`offset`, not a separate
  // unbounded loop of its own.

  it('a page API that always returns records stops at maxPages', async () => {
    let calls = 0;
    const requester = {
      async send() {
        calls++;
        return { items: [{ x: calls }] };
      },
    };
    const retriever = new SyncRetriever({
      requester,
      recordSelector: new RecordSelector({ recordPath: ['items'] }),
      requestSpec: { method: 'GET', path: '/d' },
      paginator: new Paginator({ type: 'page', pageParam: 'page' }),
      maxPages: 4,
    });
    const records = await retriever.run({});
    assert.strictEqual(calls, 4);
    assert.strictEqual(records.length, 4);
  });

  it('a cursor API that never runs out of cursor stops at maxPages (independent cap, not infinite)', async () => {
    let calls = 0;
    const requester = {
      async send() {
        calls++;
        return { items: [{ x: calls }], cursor: 'always-more' };
      },
    };
    const retriever = new SyncRetriever({
      requester,
      recordSelector: new RecordSelector({ recordPath: ['items'] }),
      requestSpec: { method: 'GET', path: '/d' },
      paginator: new Paginator({ type: 'cursor', cursorPath: ['cursor'], cursorParam: 'c' }),
      maxPages: 4,
    });
    const records = await retriever.run({});
    assert.strictEqual(calls, 4);
    assert.strictEqual(records.length, 4);
  });
});
