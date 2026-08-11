import assert from 'node:assert';
import { describe, it, before, after } from 'node:test';
import { AbstractSource } from '../src/Core/AbstractSource.js';
import { AbstractContext } from '../src/Core/AbstractContext.js';

function createContext(sourceConfig = {}) {
  return new AbstractContext({
    source: { name: 'TestSource', config: sourceConfig },
    storage: { name: 'TestStorage', config: {} },
    runConfig: {},
    env: { datamartId: 'dm-1', runId: 'run-1' },
  });
}

function suppressStdout() {
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...rest) => {
    const str = typeof chunk === 'string' ? chunk : (chunk?.toString?.() ?? '');
    // Allow TAP / test runner output through; swallow only JSON-event log lines
    // produced by AbstractContext.log (which writes JSON objects ending with \n).
    if (str.startsWith('{') && str.includes('"type"')) {
      return true;
    }
    return original(chunk, ...rest);
  };
  return () => {
    process.stdout.write = original;
  };
}

describe('AbstractSource', () => {
  describe('constructor', () => {
    it('throws without context', () => {
      assert.throws(() => new AbstractSource(null), /context is required/);
    });

    it('stores context reference', () => {
      const ctx = createContext();
      const source = new AbstractSource(ctx);
      assert.strictEqual(source.context, ctx);
    });
  });

  describe('hook defaults', () => {
    it('parseFields returns empty object when no Fields config', () => {
      const source = new AbstractSource(createContext());
      assert.deepStrictEqual(source.parseFields(source.context), {});
    });

    it('parseFields parses space-separated CSV field strings', () => {
      const ctx = createContext({ Fields: { value: 'campaigns id, campaigns name, stats date' } });
      const source = new AbstractSource(ctx);
      const result = source.parseFields(ctx);
      assert.deepStrictEqual(result, {
        campaigns: ['id', 'name'],
        stats: ['date'],
      });
    });

    it('parseFields handles node names with slashes', () => {
      const ctx = createContext({
        Fields: {
          value: 'observations/group date, observations/group label, observations/group rate',
        },
      });
      const source = new AbstractSource(ctx);
      const result = source.parseFields(ctx);
      assert.deepStrictEqual(result, {
        'observations/group': ['date', 'label', 'rate'],
      });
    });

    it('parseFields deduplicates fields within a node', () => {
      const ctx = createContext({ Fields: { value: 'campaigns id, campaigns id' } });
      const source = new AbstractSource(ctx);
      assert.deepStrictEqual(source.parseFields(ctx), { campaigns: ['id'] });
    });

    it('parseFields ignores entries without a space separator', () => {
      const ctx = createContext({ Fields: { value: 'orphan, campaigns id' } });
      const source = new AbstractSource(ctx);
      assert.deepStrictEqual(source.parseFields(ctx), { campaigns: ['id'] });
    });

    it('parseFields tolerates extra whitespace', () => {
      const ctx = createContext({ Fields: { value: '  campaigns id ,   campaigns name  ' } });
      const source = new AbstractSource(ctx);
      const result = source.parseFields(ctx);
      assert.deepStrictEqual(result, { campaigns: ['id', 'name'] });
    });

    it('parseFields returns empty object for non-string input', () => {
      const ctx = createContext({ Fields: { value: 123 } });
      const source = new AbstractSource(ctx);
      assert.deepStrictEqual(source.parseFields(ctx), {});
    });

    it('getAccounts returns [null] by default', () => {
      const source = new AbstractSource(createContext());
      assert.deepStrictEqual(source.getAccounts(source.context), [null]);
    });

    it('getDateStrategy returns day-by-day by default', () => {
      const source = new AbstractSource(createContext());
      assert.strictEqual(source.getDateStrategy('any'), 'day-by-day');
    });

    it('onAccountComplete is no-op', () => {
      const source = new AbstractSource(createContext());
      assert.strictEqual(source.onAccountComplete({ id: 'a' }), undefined);
    });

    it('onAccountError is no-op', () => {
      const source = new AbstractSource(createContext());
      assert.strictEqual(source.onAccountError({ id: 'a' }, new Error('x')), undefined);
    });

    it('onImportComplete is no-op', () => {
      const source = new AbstractSource(createContext());
      assert.strictEqual(source.onImportComplete(source.context), undefined);
    });
  });

  describe('getDestinationName', () => {
    it('returns schema destinationName when no override', () => {
      const source = new AbstractSource(createContext());
      assert.strictEqual(
        source.getDestinationName('campaigns', { destinationName: 'campaigns_table' }),
        'campaigns_table'
      );
    });

    it('falls back to nodeName when no destinationName', () => {
      const source = new AbstractSource(createContext());
      assert.strictEqual(source.getDestinationName('campaigns', {}), 'campaigns');
      assert.strictEqual(source.getDestinationName('campaigns', null), 'campaigns');
    });

    it('honors DestinationTableNameOverride ("NodeA TableA, NodeB TableB" format)', () => {
      const ctx = createContext({
        DestinationTableNameOverride: { value: 'games switch_games, campaigns campaigns_tbl' },
      });
      const source = new AbstractSource(ctx);
      // override wins over the schema destinationName, matched per node
      assert.strictEqual(
        source.getDestinationName('games', { destinationName: 'games_table' }),
        'switch_games'
      );
      assert.strictEqual(source.getDestinationName('campaigns', {}), 'campaigns_tbl');
    });

    it('falls back when the override has no entry for the node', () => {
      const ctx = createContext({ DestinationTableNameOverride: { value: 'other other_tbl' } });
      const source = new AbstractSource(ctx);
      assert.strictEqual(
        source.getDestinationName('games', { destinationName: 'games_table' }),
        'games_table'
      );
      assert.strictEqual(source.getDestinationName('games', {}), 'games');
    });
  });

  describe('fetchData', () => {
    it('throws when not overridden', async () => {
      const source = new AbstractSource(createContext());
      await assert.rejects(() => source.fetchData({ nodeName: 'x' }), /must be implemented/);
    });
  });

  describe('getFieldsSchema', () => {
    it('returns empty object when no fieldsSchema', () => {
      const source = new AbstractSource(createContext());
      assert.deepStrictEqual(source.getFieldsSchema(), {});
    });

    it('filters to nodes with non-empty fields', () => {
      const source = new AbstractSource(createContext());
      source.fieldsSchema = {
        a: { fields: ['x', 'y'] },
        b: { fields: [] },
        c: { fields: ['z'] },
      };
      assert.deepStrictEqual(Object.keys(source.getFieldsSchema()).sort(), ['a', 'c']);
    });
  });

  describe('exchangeOauthCredentials', () => {
    it('throws when not overridden', async () => {
      const source = new AbstractSource(createContext());
      await assert.rejects(() => source.exchangeOauthCredentials({}, {}), /must be implemented/);
    });
  });

  describe('refreshCredentials', () => {
    it('returns null by default', async () => {
      const source = new AbstractSource(createContext());
      const result = await source.refreshCredentials({}, {}, {});
      assert.strictEqual(result, null);
    });
  });

  describe('calculateBackoff', () => {
    it('grows exponentially', () => {
      const source = new AbstractSource(createContext());
      const a = source.calculateBackoff(0, 1000);
      const b = source.calculateBackoff(1, 1000);
      const c = source.calculateBackoff(2, 1000);
      // a: 1000 * (0.5..1.5) = 500..1500
      // b: 2000 * (0.5..1.5) = 1000..3000
      // c: 4000 * (0.5..1.5) = 2000..6000
      assert.ok(a >= 500 && a <= 1500, `attempt 0: ${a}`);
      assert.ok(b >= 1000 && b <= 3000, `attempt 1: ${b}`);
      assert.ok(c >= 2000 && c <= 6000, `attempt 2: ${c}`);
    });
  });

  describe('isValidToRetry', () => {
    it('returns false by default', () => {
      const source = new AbstractSource(createContext());
      assert.strictEqual(source.isValidToRetry(new Error('x')), false);
    });
  });

  describe('urlFetchWithRetry', () => {
    let originalFetch;
    before(() => {
      originalFetch = globalThis.fetch;
    });
    after(() => {
      globalThis.fetch = originalFetch;
    });

    it('returns response on success', async () => {
      const restore = suppressStdout();
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ result: 'success' }),
      });
      try {
        const source = new AbstractSource(createContext());
        const response = await source.urlFetchWithRetry('https://example.com/api');
        assert.strictEqual(response.ok, true);
        const json = await response.json();
        assert.strictEqual(json.result, 'success');
      } finally {
        restore();
      }
    });

    it('throws on non-OK by default (no retry without isValidToRetry override)', async () => {
      const restore = suppressStdout();
      globalThis.fetch = async () => ({ ok: false, status: 404, statusText: 'Not Found' });
      try {
        const source = new AbstractSource(createContext());
        await assert.rejects(() => source.urlFetchWithRetry('https://example.com/api'), /HTTP 404/);
      } finally {
        restore();
      }
    });

    it('retries when isValidToRetry returns true and eventually succeeds', async () => {
      const restore = suppressStdout();
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        if (calls < 3) return { ok: false, status: 503, statusText: 'Service Unavailable' };
        return { ok: true, status: 200, statusText: 'OK', json: async () => ({ done: true }) };
      };
      try {
        const ctx = createContext({
          MaxFetchRetries: { value: 3 },
          InitialRetryDelay: { value: 1 }, // 1ms for test speed
        });
        class RetrySource extends AbstractSource {
          isValidToRetry(error) {
            return error.statusCode === 503;
          }
        }
        const source = new RetrySource(ctx);
        const response = await source.urlFetchWithRetry('https://example.com/api');
        assert.strictEqual(response.ok, true);
        assert.strictEqual(calls, 3);
      } finally {
        restore();
      }
    });

    it('emits TraceEvent for each attempt', async () => {
      const events = [];
      const original = process.stdout.write;
      process.stdout.write = data => {
        try {
          for (const line of data.toString().split('\n')) {
            if (line.trim()) events.push(JSON.parse(line.trim()));
          }
        } catch {}
        return true;
      };
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({}),
      });
      try {
        const source = new AbstractSource(createContext());
        await source.urlFetchWithRetry('https://example.com/api');
        const traces = events.filter(e => e.type === 'TRACE' && e.action === 'http_request');
        assert.strictEqual(traces.length, 1);
        assert.strictEqual(traces[0].details.url, 'https://example.com/api');
      } finally {
        process.stdout.write = original;
      }
    });

    it('throws non-retryable network error immediately', async () => {
      const restore = suppressStdout();
      globalThis.fetch = async () => {
        throw new Error('ECONNREFUSED');
      };
      try {
        const ctx = createContext({ MaxFetchRetries: { value: 0 } });
        const source = new AbstractSource(ctx);
        await assert.rejects(
          () => source.urlFetchWithRetry('https://example.com/api'),
          /ECONNREFUSED/
        );
      } finally {
        restore();
      }
    });

    it('retries network error when isValidToRetry returns true and eventually succeeds', async () => {
      const restore = suppressStdout();
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        if (calls < 3) throw new Error('ECONNRESET');
        return { ok: true, status: 200, statusText: 'OK', json: async () => ({ done: true }) };
      };
      try {
        const ctx = createContext({
          MaxFetchRetries: { value: 3 },
          InitialRetryDelay: { value: 1 },
        });
        class NetRetrySource extends AbstractSource {
          isValidToRetry(error) {
            return /ECONNRESET/.test(error.message);
          }
        }
        const source = new NetRetrySource(ctx);
        const response = await source.urlFetchWithRetry('https://example.com/api');
        assert.strictEqual(response.ok, true);
        assert.strictEqual(calls, 3);
      } finally {
        restore();
      }
    });

    it('throws last error when retry attempts exhausted', async () => {
      const restore = suppressStdout();
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        throw new Error(`network failure ${calls}`);
      };
      try {
        const ctx = createContext({
          MaxFetchRetries: { value: 2 },
          InitialRetryDelay: { value: 1 },
        });
        class AlwaysRetrySource extends AbstractSource {
          isValidToRetry() {
            return true;
          }
        }
        const source = new AlwaysRetrySource(ctx);
        await assert.rejects(
          () => source.urlFetchWithRetry('https://example.com/api'),
          /network failure 2/ // main-parity: MaxFetchRetries is the TOTAL attempt count, so 2 calls total
        );
        assert.strictEqual(calls, 2);
      } finally {
        restore();
      }
    });

    it('throws HTTP error when retry attempts exhausted on retryable status', async () => {
      const restore = suppressStdout();
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        return { ok: false, status: 503, statusText: 'Service Unavailable' };
      };
      try {
        const ctx = createContext({
          MaxFetchRetries: { value: 2 },
          InitialRetryDelay: { value: 1 },
        });
        class HttpRetrySource extends AbstractSource {
          isValidToRetry(error) {
            return error.statusCode === 503;
          }
        }
        const source = new HttpRetrySource(ctx);
        await assert.rejects(() => source.urlFetchWithRetry('https://example.com/api'), /HTTP 503/);
        assert.strictEqual(calls, 2); // main-parity: MaxFetchRetries is the TOTAL attempt count
      } finally {
        restore();
      }
    });

    it('respects MaxFetchRetries: 0 (no retries)', async () => {
      const restore = suppressStdout();
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        throw new Error('network failure');
      };
      try {
        const ctx = createContext({
          MaxFetchRetries: { value: 0 },
          InitialRetryDelay: { value: 1 },
        });
        class AlwaysRetrySource extends AbstractSource {
          isValidToRetry() {
            return true;
          }
        }
        const source = new AlwaysRetrySource(ctx);
        await assert.rejects(() => source.urlFetchWithRetry('https://example.com/api'));
        assert.strictEqual(calls, 1); // single attempt, no retries
      } finally {
        restore();
      }
    });
  });
});

// A retry notice describes a transient condition the engine ALREADY recovered
// from, so it must not be logged at WARN. The backend translates LOG(warn) into
// ConnectorMessageType.WARNING (connector-event.translator.ts), pushes it into
// configErrors (connector-executor.service.ts) and then demotes the config with
// `if (success && configErrors.length > 0) success = false`. At WARN, one 503
// that the very next attempt fixed turns a complete, correct import into a
// FAILED run -- and once flaky-network runs are routinely FAILED, a genuinely
// partial run is indistinguishable from a healthy one. main logged both notices
// through config.logMessage(), i.e. INFO.
describe('AbstractSource retry notices are INFO, not WARN', () => {
  let originalFetch;
  before(() => {
    originalFetch = globalThis.fetch;
  });
  after(() => {
    globalThis.fetch = originalFetch;
  });

  // Replaces ctx.log so the LEVEL is asserted, not just the message: a test that
  // only matched the text would pass at either level.
  function captureLogs(ctx) {
    const logs = [];
    ctx.log = (level, message) => logs.push({ level, message });
    return logs;
  }

  function retryContext() {
    return createContext({
      MaxFetchRetries: { value: 3 },
      InitialRetryDelay: { value: 1 },
    });
  }

  it('logs the HTTP retry notice at INFO for a 503 the retry fixed', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1) return { ok: false, status: 503, statusText: 'Service Unavailable' };
      return { ok: true, status: 200, statusText: 'OK', json: async () => ({ done: true }) };
    };
    const ctx = retryContext();
    const logs = captureLogs(ctx);
    class RetrySource extends AbstractSource {
      isValidToRetry(error) {
        return error.statusCode === 503;
      }
    }
    const response = await new RetrySource(ctx).urlFetchWithRetry('https://example.com/api');

    assert.strictEqual(response.ok, true);
    assert.strictEqual(calls, 2);
    const notices = logs.filter(l => l.message.includes('retrying in'));
    assert.strictEqual(notices.length, 1, `expected one retry notice, got ${notices.length}`);
    assert.strictEqual(notices[0].level, 'info');
    assert.deepStrictEqual(
      logs.filter(l => l.level === 'warn'),
      [],
      'a recovered request must not emit any WARN -- the backend would fail the run'
    );
  });

  it('logs the network-error retry notice at INFO for an ECONNRESET the retry fixed', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1) throw new Error('ECONNRESET');
      return { ok: true, status: 200, statusText: 'OK', json: async () => ({ done: true }) };
    };
    const ctx = retryContext();
    const logs = captureLogs(ctx);
    class NetRetrySource extends AbstractSource {
      isValidToRetry(error) {
        return /ECONNRESET/.test(error.message);
      }
    }
    const response = await new NetRetrySource(ctx).urlFetchWithRetry('https://example.com/api');

    assert.strictEqual(response.ok, true);
    assert.strictEqual(calls, 2);
    const notices = logs.filter(l => l.message.startsWith('Request error:'));
    assert.strictEqual(notices.length, 1, `expected one retry notice, got ${notices.length}`);
    assert.strictEqual(notices[0].level, 'info');
    assert.deepStrictEqual(
      logs.filter(l => l.level === 'warn'),
      [],
      'a recovered request must not emit any WARN -- the backend would fail the run'
    );
  });
});
