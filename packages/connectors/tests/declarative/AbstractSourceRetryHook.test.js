import assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { AbstractSource } from '../../src/Core/AbstractSource.js';

const fakeContext = {
  emit() {},
  log() {},
  getParameter() {
    return null;
  },
};

class SyncSource extends AbstractSource {
  constructor() {
    super(fakeContext);
    this.checks = 0;
  }
  isValidToRetry() {
    this.checks++;
    return true;
  } // sync override (bundled-style)
  _delay() {
    return Promise.resolve();
  }
}
class AsyncSource extends AbstractSource {
  constructor() {
    super(fakeContext);
    this.checks = 0;
  }
  async isValidToRetry() {
    this.checks++;
    return true;
  } // async override (declarative-style)
  _delay() {
    return Promise.resolve();
  }
}
class AsyncNoRetrySource extends AbstractSource {
  constructor() {
    super(fakeContext);
    this.checks = 0;
  }
  async isValidToRetry() {
    this.checks++;
    return false;
  }
  _delay() {
    return Promise.resolve();
  }
}

describe('AbstractSource.urlFetchWithRetry awaits isValidToRetry', () => {
  let originalFetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function failOnceThenOk() {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1)
        return { ok: false, status: 500, statusText: 'Err', headers: { get: () => null } };
      return { ok: true, status: 200, headers: { get: () => null } };
    };
    return () => calls;
  }

  it('retries with a SYNC isValidToRetry override (no regression)', async () => {
    const calls = failOnceThenOk();
    const s = new SyncSource();
    const res = await s.urlFetchWithRetry('https://api.example.com/x', { method: 'GET' });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(calls(), 2);
    assert.strictEqual(s.checks, 1);
  });

  it('retries with an ASYNC isValidToRetry override (the new declarative path)', async () => {
    const calls = failOnceThenOk();
    const s = new AsyncSource();
    const res = await s.urlFetchWithRetry('https://api.example.com/x', { method: 'GET' });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(calls(), 2);
    assert.strictEqual(s.checks, 1);
  });

  it('an async isValidToRetry returning false does NOT retry (proves the await is required)', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return { ok: false, status: 500, statusText: 'Err', headers: { get: () => null } };
    };
    const s = new AsyncNoRetrySource();
    await assert.rejects(() => s.urlFetchWithRetry('https://api.example.com/x', { method: 'GET' }));
    assert.strictEqual(calls, 1);
    assert.strictEqual(s.checks, 1);
  });

  it('retries a thrown network error with an async override (the catch-path await, line ~195)', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1) throw new Error('ECONNREFUSED');
      return { ok: true, status: 200, headers: { get: () => null } };
    };
    const s = new AsyncSource();
    const res = await s.urlFetchWithRetry('https://api.example.com/x', { method: 'GET' });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(calls, 2);
  });
});

describe('AbstractSource.urlFetchWithRetry enriches error diagnostics', () => {
  let originalFetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // A network error from `fetch` is a TypeError("fetch failed") whose real reason
  // (DNS/connection) lives in `error.cause`. The engine must surface the cause.
  function makeSource(logs, { retry = true } = {}) {
    const ctx = { emit() {}, log: (_lvl, msg) => logs.push(msg), getParameter: () => null };
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
      // MaxFetchRetries is main-parity: TOTAL attempts, not retries-after-initial.
      // 2 total attempts = 1 retry, which is what these tests exercise.
      _getRetryParam(name, def) {
        return name === 'MaxFetchRetries' ? 2 : 0;
      }
    }
    return new S();
  }

  it('logs the fetch error CAUSE (code + message), not just "fetch failed"', async () => {
    const logs = [];
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1) {
        const e = new TypeError('fetch failed');
        e.cause = { code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND api.samplapis.com' };
        throw e;
      }
      return { ok: true, status: 200, headers: { get: () => null } };
    };
    await makeSource(logs).urlFetchWithRetry('https://api.samplapis.com/x', {});
    const warn = logs.find(m => m.startsWith('Request error:'));
    assert.ok(warn, 'expected a "Request error:" warn log');
    assert.ok(warn.includes('ENOTFOUND'), `cause code missing: ${warn}`);
    assert.ok(
      warn.includes('getaddrinfo ENOTFOUND api.samplapis.com'),
      `cause message missing: ${warn}`
    );
  });

  it('the FINAL thrown network error carries the cause after retries are exhausted', async () => {
    globalThis.fetch = async () => {
      const e = new TypeError('fetch failed');
      e.cause = { code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND host' };
      throw e;
    };
    await assert.rejects(
      () => makeSource([]).urlFetchWithRetry('https://h/x', {}),
      err => {
        assert.ok(err.message.includes('ENOTFOUND'), `got: ${err.message}`);
        return true;
      }
    );
  });

  it('logs the HTTP error response BODY snippet on a retryable failure', async () => {
    const logs = [];
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1) {
        return {
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: { get: () => null },
          text: async () => '{"error":"rate limited, slow down"}',
        };
      }
      return { ok: true, status: 200, headers: { get: () => null } };
    };
    await makeSource(logs).urlFetchWithRetry('https://h/x', {});
    const warn = logs.find(m => m.startsWith('Request failed'));
    assert.ok(warn, 'expected a "Request failed" warn log');
    assert.ok(warn.includes('rate limited, slow down'), `body snippet missing: ${warn}`);
  });

  it('the thrown HTTP error message includes the response body (non-retryable)', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: { get: () => null },
      text: async () => '{"error":"bad param X"}',
    });
    await assert.rejects(
      () => makeSource([], { retry: false }).urlFetchWithRetry('https://h/x', {}),
      err => {
        assert.ok(err.message.includes('bad param X'), `body missing from message: ${err.message}`);
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );
  });
});

describe('AbstractSource.urlFetchWithRetry caps the retry budget in OW_TEST mode', () => {
  let originalFetch, originalTest;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalTest = process.env.OW_TEST;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalTest === undefined) delete process.env.OW_TEST;
    else process.env.OW_TEST = originalTest;
  });

  // Source with the DEFAULT (uncapped) retry budget: 3 retries, 5000ms initial delay.
  class DefaultRetrySource extends AbstractSource {
    constructor() {
      super({ emit() {}, log() {}, getParameter: () => null });
    }
    async isValidToRetry() {
      return true;
    }
    _delay() {
      return Promise.resolve();
    } // don't actually wait in the test
  }

  it('caps to ONE retry (2 fetches total) when OW_TEST is set', async () => {
    process.env.OW_TEST = '1';
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      const e = new TypeError('fetch failed');
      e.cause = { code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND h' };
      throw e;
    };
    await assert.rejects(() => new DefaultRetrySource().urlFetchWithRetry('https://h/x', {}));
    assert.strictEqual(calls, 2, `expected 1 initial + 1 capped retry, got ${calls} fetches`);
  });

  it('keeps the FULL budget (3 fetches: MaxFetchRetries=3 total attempts) when OW_TEST is NOT set', async () => {
    delete process.env.OW_TEST;
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      throw new Error('ECONNRESET');
    };
    await assert.rejects(() => new DefaultRetrySource().urlFetchWithRetry('https://h/x', {}));
    // main-parity: MaxFetchRetries (default 3) is the TOTAL attempt count.
    assert.strictEqual(calls, 3, `expected 3 default total attempts, got ${calls} fetches`);
  });
});
