import assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { DeclarativeSource } from '../../src/Core/Declarative/DeclarativeSource.js';
import { ManifestParser } from '../../src/Core/Declarative/ManifestParser.js';
import { AbstractContext } from '../../src/Core/AbstractContext.js';

// A fetch Response body is SINGLE-SHOT. AbstractSource.urlFetchWithRetry reads it
// on every non-OK response (it embeds a snippet in the error message) before it
// consults isValidToRetry, so by the time the declarative errorHandler runs, the
// stream is spent: a second `.text()` rejects with "Body is unusable".
//
// Every other errorHandler test in this suite mocks the response as a plain object
// whose `.text()` re-serves the same string on demand, which no real response does.
// That is precisely why the suite stayed green while EVERY `messageContains` /
// `bodyMatch` filter was inert in production — matched against '' rather than the
// body, so no IGNORE/RETRY/FAIL rule an author wrote ever fired.
//
// These tests therefore use real `Response` objects and nothing else.
const manifest = responseFilters =>
  JSON.stringify({
    version: '1.0',
    name: 'ErrBody',
    baseUrl: 'https://api.example.com',
    parameters: {},
    nodes: {
      events: {
        destinationName: 'events',
        isTimeSeries: false,
        uniqueKeys: ['id'],
        fields: { id: { dataPath: 'id', type: 'string' } },
        request: { method: 'GET', path: '/events' },
        recordSelector: { recordPath: ['data'] },
        errorHandler: { responseFilters },
      },
    },
  });

function makeContext() {
  return new AbstractContext({
    source: { name: 'ErrBody', config: {} },
    storage: { name: 'MockStorage', config: {} },
    runConfig: { type: 'INCREMENTAL', data: [], state: {} },
    env: { datamartId: 'dm', runId: 'run' },
  });
}

function makeSource(responseFilters) {
  const model = new ManifestParser().parse(manifest(responseFilters));
  const source = new DeclarativeSource(makeContext(), model);
  source._delay = () => Promise.resolve();
  return source;
}

const fetchNode = source =>
  source.fetchData({
    nodeName: 'events',
    fields: ['id'],
    accountId: null,
    startDate: null,
    endDate: null,
  });

describe('errorHandler filters against a real (single-shot) response body', () => {
  let originalFetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('matches messageContains against the body the fetch path already consumed', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      // A fresh Response per call: one cannot be re-read, exactly like the real thing.
      return new Response('error: No changes are scheduled for this subscription', {
        status: 400,
        statusText: 'Bad Request',
      });
    };
    const source = makeSource([
      { httpCodes: [400], messageContains: 'No changes are scheduled', action: 'IGNORE' },
    ]);
    assert.deepStrictEqual(await fetchNode(source), []);
    assert.strictEqual(calls, 1, 'IGNORE is terminal — no retry');
  });

  it('matches a bodyMatch json path, so a FAIL filter stops the default 5xx retry', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ error: { type: 'QUOTA_EXCEEDED' } }), {
        status: 503,
        statusText: 'Service Unavailable',
      });
    };
    const source = makeSource([
      {
        httpCodes: [503],
        bodyMatch: { path: ['error', 'type'], equals: 'QUOTA_EXCEEDED' },
        action: 'FAIL',
      },
    ]);
    await assert.rejects(() => fetchNode(source), /503/);
    // Without the body the filter cannot match and 503 falls back to the default
    // retryable set, so this used to be 3 attempts (MaxFetchRetries) instead of 1.
    assert.strictEqual(calls, 1, 'a matched FAIL filter must suppress the default 5xx retry');
  });

  it('matches a body-conditioned RETRY filter and recovers', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1) {
        return new Response(JSON.stringify({ retryable: true }), {
          status: 422,
          statusText: 'Unprocessable',
        });
      }
      return new Response(JSON.stringify({ data: [{ id: 'ok' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    const source = makeSource([
      {
        httpCodes: [422],
        bodyMatch: { path: ['retryable'], equals: 'true' },
        action: 'RETRY',
        backoff: { type: 'constant', delayMs: 1 },
      },
    ]);
    const out = await fetchNode(source);
    assert.deepStrictEqual(
      out.map(r => r.id),
      ['ok']
    );
    // 422 is NOT in the default retryable set, so a second call proves the filter
    // matched on the body rather than the engine retrying on its own.
    assert.strictEqual(calls, 2);
  });

  it('re-matches the body on every attempt, so a RETRY filter exhausts the budget', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ retryable: true }), {
        status: 422,
        statusText: 'Unprocessable',
      });
    };
    const source = makeSource([
      {
        httpCodes: [422],
        bodyMatch: { path: ['retryable'], equals: 'true' },
        action: 'RETRY',
        backoff: { type: 'constant', delayMs: 1 },
      },
    ]);
    await assert.rejects(() => fetchNode(source), /422/);
    // Each attempt carries its own fresh Response, hence its own body: 422 is not
    // retryable by default, so all three attempts happen only because the filter
    // matched every time.
    assert.strictEqual(calls, 3, 'exhausts MaxFetchRetries, matching the body every attempt');
  });
});
