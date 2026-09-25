import assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { AbstractSource } from '../../src/Core/AbstractSource.js';

// Capture emitted events + log lines so we can assert on what gets logged.
function makeSource({ retry = false } = {}) {
  const events = [];
  const logs = [];
  const ctx = {
    emit: e => events.push(e),
    log: (_lvl, msg) => logs.push(msg),
    getParameter: () => null,
  };
  class S extends AbstractSource {
    constructor() {
      super(ctx);
    }
    async isValidToRetry() {
      return retry;
    }
    _delay() {
      return Promise.resolve();
    }
    _getRetryParam(name, def) {
      return name === 'MaxFetchRetries' ? 0 : 0;
    }
  }
  return { src: new S(), events, logs };
}

function okRes(body = {}) {
  return {
    status: 200,
    statusText: 'OK',
    ok: true,
    headers: { get: () => null },
    async json() {
      return body;
    },
    async text() {
      return '';
    },
  };
}

describe('AbstractSource.urlFetchWithRetry — credential redaction (Task 2.1)', () => {
  let originalFetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('http_request trace does not log query-string credentials', async () => {
    const { src, events } = makeSource();
    globalThis.fetch = async () => okRes({ ok: true });
    await src.urlFetchWithRetry('https://api.x/data?app_id=SECRETKEY&other=1', { method: 'GET' });
    const trace = events.find(e => e.action === 'http_request');
    assert.ok(trace, 'expected an http_request trace event');
    assert.ok(
      !JSON.stringify(trace).includes('SECRETKEY'),
      `secret leaked into trace: ${JSON.stringify(trace)}`
    );
    // sanity: the origin + path is still logged (useful for diagnosis)
    assert.strictEqual(trace.details.url, 'https://api.x/data');
  });

  it('the redacted trace keeps origin + path but drops the whole query string', async () => {
    const { src, events } = makeSource();
    globalThis.fetch = async () => okRes({ ok: true });
    await src.urlFetchWithRetry('https://api.x/v1/reports?token=abc&key=def', { method: 'GET' });
    const trace = events.find(e => e.action === 'http_request');
    assert.strictEqual(trace.details.url, 'https://api.x/v1/reports');
    assert.ok(!JSON.stringify(trace).includes('abc'));
    assert.ok(!JSON.stringify(trace).includes('def'));
  });

  it('the HTTP error message does not echo query-string credentials from the request URL', async () => {
    const { src } = makeSource({ retry: false });
    globalThis.fetch = async () => ({
      status: 401,
      statusText: 'Unauthorized',
      ok: false,
      headers: { get: () => null },
      async text() {
        return '{"error":"invalid_token"}';
      },
    });
    await assert.rejects(
      () => src.urlFetchWithRetry('https://api.x/data?app_id=SECRETKEY', { method: 'GET' }),
      err => {
        // The API's own error body may still be shown (it is not our secret), but
        // the request URL's query string must not be echoed into the message.
        assert.ok(
          !err.message.includes('SECRETKEY'),
          `secret leaked into error message: ${err.message}`
        );
        return true;
      }
    );
  });
});
