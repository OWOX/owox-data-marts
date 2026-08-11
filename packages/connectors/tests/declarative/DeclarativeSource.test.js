import assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { DeclarativeSource } from '../../src/Core/Declarative/DeclarativeSource.js';
import { ManifestParser } from '../../src/Core/Declarative/ManifestParser.js';
import { AbstractContext } from '../../src/Core/AbstractContext.js';
import { AbstractConnector } from '../../src/Core/AbstractConnector.js';
import {
  SlidingWindowRateLimiter,
  UnlimitedRateLimiter,
} from '../../src/Core/Declarative/rateLimiter.js';

const MANIFEST = JSON.stringify({
  version: '1.0',
  name: 'Demo',
  baseUrl: 'https://api.example.com',
  authentication: {
    type: 'apiKey',
    inject: { into: 'query', name: 'app_id', format: '{{ parameters.AppId }}' },
  },
  parameters: { AppId: { requiredType: 'string', isRequired: true }, Fields: {} },
  nodes: {
    rates: {
      destinationName: 'demo_rates',
      isTimeSeries: true,
      uniqueKeys: ['date', 'currency'],
      fields: {
        date: { apiName: 'date', type: 'date' },
        currency: { apiName: 'currency', type: 'string' },
        rate: { apiName: 'rate', type: 'number' },
      },
      incremental: {
        strategy: 'day-by-day',
        cursorField: 'date',
        request: { into: 'query', startName: 'date', format: 'YYYY-MM-DD' },
      },
      request: { method: 'GET', path: '/historical.json' },
      recordSelector: { recordPath: ['rows'] },
    },
  },
});

class MockStorage {
  constructor(context, uniqueKeys, schema, tableName) {
    this.tableName = tableName;
    this.records = [];
  }
  async init() {}
  async saveData(records) {
    this.records.push(...records);
  }
}

function makeContext() {
  return new AbstractContext({
    source: {
      name: 'Demo',
      config: {
        AppId: { value: 'KEY' },
        Fields: { value: 'rates date, rates currency, rates rate' },
        LastRequestedDate: { value: '2026-01-02' },
        ReimportLookbackWindow: { value: 0 },
      },
    },
    storage: { name: 'MockStorage', config: {} },
    runConfig: { type: 'INCREMENTAL', data: [], state: {} },
    env: { datamartId: 'dm', runId: 'run' },
  });
}

function makeSelectiveContext(config) {
  return new AbstractContext({
    source: { name: 'S', config },
    storage: { name: 'MockStorage', config: {} },
    runConfig: { type: 'INCREMENTAL', data: [], state: {} },
    env: { datamartId: 'dm', runId: 'run' },
  });
}

describe('DeclarativeSource (integration)', () => {
  let originalFetch;
  let requestedUrls;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    requestedUrls = [];
    globalThis.fetch = async url => {
      requestedUrls.push(url);
      return {
        ok: true,
        status: 200,
        async json() {
          return { rows: [{ date: '2026-01-02', currency: 'USD', rate: '1.1' }] };
        },
      };
    };
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('compiles the manifest into fieldsSchema + parameters', () => {
    const model = new ManifestParser().parse(MANIFEST);
    const source = new DeclarativeSource(makeContext(), model);
    assert.strictEqual(source.fieldsSchema.rates.isTimeSeries, true);
    assert.deepStrictEqual(source.fieldsSchema.rates.uniqueKeys, ['date', 'currency']);
  });

  it('runs end-to-end through AbstractConnector and reaches storage', async () => {
    const model = new ManifestParser().parse(MANIFEST);
    const context = makeContext();
    const events = [];
    context.emit = e => events.push(e.toJSON ? e.toJSON() : e);

    const stores = [];
    class TrackingStorage extends MockStorage {
      constructor(...a) {
        super(...a);
        stores.push(this);
      }
    }

    const source = new DeclarativeSource(context, model);
    await new AbstractConnector(context, source, TrackingStorage).run();

    const total = stores.reduce((n, s) => n + s.records.length, 0);
    assert.ok(total >= 1, 'expected at least one record saved');
    assert.strictEqual(stores[0].records[0].currency, 'USD');
    assert.strictEqual(stores[0].records[0].rate, 1.1);

    const control = events.filter(e => e.type === 'CONTROL');
    assert.strictEqual(control[control.length - 1].action, 'completed');
    assert.ok(
      events.some(e => e.type === 'STATE'),
      'expected a STATE event'
    );

    assert.ok(requestedUrls[0].includes('app_id=KEY'));
    assert.ok(requestedUrls[0].includes('date=2026-01-02'));
  });

  it('getFieldsSchema returns object-keyed declarative nodes (not empty)', () => {
    const model = new ManifestParser().parse(MANIFEST);
    const source = new DeclarativeSource(makeContext(), model);
    const schema = source.getFieldsSchema();
    assert.ok(schema.rates, 'expected the rates node in getFieldsSchema output');
    assert.deepStrictEqual(Object.keys(schema.rates.fields), ['date', 'currency', 'rate']);
  });

  it('applies transformations before field casting (added field reaches the cast output)', async () => {
    const transformManifest = JSON.stringify({
      version: '1.0',
      name: 'TfDemo',
      baseUrl: 'https://api.example.com',
      authentication: { type: 'apiKey', inject: { into: 'query', name: 'key', format: 'test' } },
      parameters: {},
      nodes: {
        items: {
          destinationName: 'demo_items',
          isTimeSeries: false,
          uniqueKeys: ['id'],
          fields: {
            id: { dataPath: 'id', type: 'string' },
            label: { dataPath: 'label', type: 'string' },
          },
          transformations: [{ type: 'add', field: 'label', value: 'item-{{ record.id }}' }],
          request: { method: 'GET', path: '/items' },
          recordSelector: { recordPath: ['data'] },
        },
      },
    });
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      async json() {
        return { data: [{ id: '7' }] };
      },
    });
    const model = new ManifestParser().parse(transformManifest);
    const source = new DeclarativeSource(makeContext(), model);
    const out = await source.fetchData({
      nodeName: 'items',
      fields: ['id', 'label'],
      accountId: null,
      startDate: '2026-01-01',
      endDate: '2026-01-01',
    });
    assert.strictEqual(out[0].id, '7');
    assert.strictEqual(out[0].label, 'item-7');
  });

  it('reformats the injected cursor date per incremental.request.format', async () => {
    const fmtManifest = JSON.stringify({
      version: '1.0',
      name: 'FmtDemo',
      baseUrl: 'https://api.example.com',
      authentication: { type: 'apiKey', inject: { into: 'query', name: 'key', format: 'test' } },
      parameters: {},
      nodes: {
        events: {
          destinationName: 'demo_events',
          isTimeSeries: true,
          uniqueKeys: ['id'],
          fields: { id: { dataPath: 'id', type: 'string' } },
          incremental: {
            strategy: 'day-by-day',
            cursorField: 'ts',
            request: { into: 'query', startName: 'from', format: 'X' },
          },
          request: { method: 'GET', path: '/events' },
          recordSelector: { recordPath: ['data'] },
        },
      },
    });
    let capturedUrl = '';
    globalThis.fetch = async url => {
      capturedUrl = String(url);
      return {
        ok: true,
        status: 200,
        async json() {
          return { data: [] };
        },
      };
    };
    const model = new ManifestParser().parse(fmtManifest);
    const source = new DeclarativeSource(makeContext(), model);
    await source.fetchData({
      nodeName: 'events',
      fields: ['id'],
      accountId: null,
      startDate: '2026-01-02',
      endDate: '2026-01-02',
    });
    const epoch = String(Math.floor(Date.UTC(2026, 0, 2) / 1000));
    assert.ok(capturedUrl.includes(`from=${epoch}`), `expected from=${epoch} in ${capturedUrl}`);
  });

  it('leaves the cursor date as YYYY-MM-DD when the format is YYYY-MM-DD (identity)', async () => {
    const idManifest = JSON.stringify({
      version: '1.0',
      name: 'IdDemo',
      baseUrl: 'https://api.example.com',
      authentication: { type: 'apiKey', inject: { into: 'query', name: 'key', format: 'test' } },
      parameters: {},
      nodes: {
        events: {
          destinationName: 'demo_events',
          isTimeSeries: true,
          uniqueKeys: ['id'],
          fields: { id: { dataPath: 'id', type: 'string' } },
          incremental: {
            strategy: 'day-by-day',
            cursorField: 'ts',
            request: { into: 'query', startName: 'from', format: 'YYYY-MM-DD' },
          },
          request: { method: 'GET', path: '/events' },
          recordSelector: { recordPath: ['data'] },
        },
      },
    });
    let capturedUrl = '';
    globalThis.fetch = async url => {
      capturedUrl = String(url);
      return {
        ok: true,
        status: 200,
        async json() {
          return { data: [] };
        },
      };
    };
    const model = new ManifestParser().parse(idManifest);
    const source = new DeclarativeSource(makeContext(), model);
    await source.fetchData({
      nodeName: 'events',
      fields: ['id'],
      accountId: null,
      startDate: '2026-01-02',
      endDate: '2026-01-02',
    });
    assert.ok(
      capturedUrl.includes('from=2026-01-02'),
      `expected from=2026-01-02 in ${capturedUrl}`
    );
  });

  const errorManifest = errorHandler =>
    JSON.stringify({
      version: '1.0',
      name: 'ErrDemo',
      baseUrl: 'https://api.example.com',
      authentication: { type: 'apiKey', inject: { into: 'query', name: 'key', format: 'test' } },
      parameters: {},
      nodes: {
        events: {
          destinationName: 'demo_events',
          isTimeSeries: false,
          uniqueKeys: ['id'],
          fields: { id: { dataPath: 'id', type: 'string' } },
          request: { method: 'GET', path: '/events' },
          recordSelector: { recordPath: ['data'] },
          errorHandler,
        },
      },
    });

  it('retries a RETRY-filtered status and honours the Retry-After delay, then succeeds', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1) {
        return {
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: { get: n => (n === 'Retry-After' ? '1' : null) },
          async json() {
            return {};
          },
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        async json() {
          return { data: [{ id: '1' }] };
        },
      };
    };
    const model = new ManifestParser().parse(
      errorManifest({
        responseFilters: [{ httpCodes: [429], action: 'RETRY' }],
        backoff: { type: 'waitTimeFromHeader', header: 'Retry-After' },
      })
    );
    const source = new DeclarativeSource(makeContext(), model);
    const delays = [];
    source._delay = ms => {
      delays.push(ms);
      return Promise.resolve();
    };
    const out = await source.fetchData({
      nodeName: 'events',
      fields: ['id'],
      accountId: null,
      startDate: null,
      endDate: null,
    });
    assert.strictEqual(calls, 2);
    assert.deepStrictEqual(delays, [1000]); // Retry-After 1s honoured, not exponential
    assert.strictEqual(out[0].id, '1');
  });

  it('IGNORE-filters a status and returns zero records without failing', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: { get: () => null },
      async json() {
        return {};
      },
    });
    const model = new ManifestParser().parse(
      errorManifest({ responseFilters: [{ httpCodes: [404], action: 'IGNORE' }] })
    );
    const source = new DeclarativeSource(makeContext(), model);
    source._delay = () => Promise.resolve();
    const out = await source.fetchData({
      nodeName: 'events',
      fields: ['id'],
      accountId: null,
      startDate: null,
      endDate: null,
    });
    assert.deepStrictEqual(out, []);
  });

  it('FAIL-filters a status and rejects without retrying', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: { get: () => null },
        async json() {
          return {};
        },
      };
    };
    const model = new ManifestParser().parse(
      errorManifest({ responseFilters: [{ httpCodes: [401], action: 'FAIL' }] })
    );
    const source = new DeclarativeSource(makeContext(), model);
    source._delay = () => Promise.resolve();
    await assert.rejects(() =>
      source.fetchData({
        nodeName: 'events',
        fields: ['id'],
        accountId: null,
        startDate: null,
        endDate: null,
      })
    );
    assert.strictEqual(calls, 1);
  });

  it('without an errorHandler still retries a 500 (default path unchanged)', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1)
        return {
          ok: false,
          status: 500,
          statusText: 'Server Error',
          headers: { get: () => null },
          async json() {
            return {};
          },
        };
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        async json() {
          return { data: [{ id: '9' }] };
        },
      };
    };
    const model = new ManifestParser().parse(errorManifest(undefined));
    const source = new DeclarativeSource(makeContext(), model);
    source._delay = () => Promise.resolve();
    const out = await source.fetchData({
      nodeName: 'events',
      fields: ['id'],
      accountId: null,
      startDate: null,
      endDate: null,
    });
    assert.strictEqual(calls, 2);
    assert.strictEqual(out[0].id, '9');
  });

  it('IGNORE-filters by message body and returns zero records', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: { get: () => null },
      async json() {
        return {};
      },
      async text() {
        return 'error: No changes are scheduled for this subscription';
      },
    });
    const model = new ManifestParser().parse(
      errorManifest({
        responseFilters: [
          { httpCodes: [400], messageContains: 'No changes are scheduled', action: 'IGNORE' },
        ],
      })
    );
    const source = new DeclarativeSource(makeContext(), model);
    source._delay = () => Promise.resolve();
    const out = await source.fetchData({
      nodeName: 'events',
      fields: ['id'],
      accountId: null,
      startDate: null,
      endDate: null,
    });
    assert.deepStrictEqual(out, []);
  });

  it('FAIL-filters by a bodyMatch json path and rejects', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      headers: { get: () => null },
      async json() {
        return {};
      },
      async text() {
        return JSON.stringify({ error: { type: 'INVALID_PERMISSIONS' } });
      },
    });
    const model = new ManifestParser().parse(
      errorManifest({
        responseFilters: [
          {
            httpCodes: [403],
            bodyMatch: { path: ['error', 'type'], equals: 'INVALID_PERMISSIONS' },
            action: 'FAIL',
          },
        ],
      })
    );
    const source = new DeclarativeSource(makeContext(), model);
    source._delay = () => Promise.resolve();
    await assert.rejects(() =>
      source.fetchData({
        nodeName: 'events',
        fields: ['id'],
        accountId: null,
        startDate: null,
        endDate: null,
      })
    );
  });

  it('retries ONLY when the body matches (retry-on-body), then succeeds', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1) {
        return {
          ok: false,
          status: 503,
          statusText: 'Unavailable',
          headers: { get: () => null },
          async json() {
            return {};
          },
          async text() {
            return JSON.stringify({ retryable: true });
          },
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        async json() {
          return { data: [{ id: '7' }] };
        },
      };
    };
    const model = new ManifestParser().parse(
      errorManifest({
        responseFilters: [
          {
            httpCodes: [503],
            bodyMatch: { path: ['retryable'], equals: 'true' },
            action: 'RETRY',
            backoff: { type: 'constant', delayMs: 10 },
          },
        ],
      })
    );
    const source = new DeclarativeSource(makeContext(), model);
    const delays = [];
    source._delay = ms => {
      delays.push(ms);
      return Promise.resolve();
    };
    const out = await source.fetchData({
      nodeName: 'events',
      fields: ['id'],
      accountId: null,
      startDate: null,
      endDate: null,
    });
    assert.strictEqual(calls, 2);
    assert.deepStrictEqual(delays, [10]);
    assert.strictEqual(out[0].id, '7');
  });

  it('does NOT retry when the body does not match the retry filter (non-default code)', async () => {
    // 422 is NOT in the default-retry set (>=500 / 429), so when the body-conditioned
    // RETRY filter does not match, there is no fallback retry: exactly one call.
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return {
        ok: false,
        status: 422,
        statusText: 'Unprocessable',
        headers: { get: () => null },
        async json() {
          return {};
        },
        async text() {
          return JSON.stringify({ retryable: false });
        },
      };
    };
    const model = new ManifestParser().parse(
      errorManifest({
        responseFilters: [
          { httpCodes: [422], bodyMatch: { path: ['retryable'], equals: 'true' }, action: 'RETRY' },
        ],
      })
    );
    const source = new DeclarativeSource(makeContext(), model);
    source._delay = () => Promise.resolve();
    await assert.rejects(() =>
      source.fetchData({
        nodeName: 'events',
        fields: ['id'],
        accountId: null,
        startDate: null,
        endDate: null,
      })
    );
    assert.strictEqual(calls, 1);
  });

  it('authorizes via the selective apiKey branch chosen by a parameter', async () => {
    const urls = [];
    globalThis.fetch = async url => {
      urls.push(url);
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        async json() {
          return { data: [{ id: '1' }] };
        },
      };
    };
    const manifest = JSON.stringify({
      version: '1.0',
      name: 'S',
      baseUrl: 'https://api.example.com',
      authentication: {
        type: 'selective',
        selectionParameter: 'AuthMethod',
        authenticators: {
          apikey: {
            type: 'apiKey',
            inject: { into: 'query', name: 'key', format: '{{ parameters.ApiKey }}' },
          },
          basic: {
            type: 'basic',
            username: '{{ parameters.User }}',
            password: '{{ parameters.Pass }}',
          },
        },
      },
      parameters: {
        AuthMethod: { requiredType: 'string', isRequired: true },
        ApiKey: { requiredType: 'string', isRequired: true },
        Fields: {},
      },
      nodes: {
        items: {
          destinationName: 'd',
          isTimeSeries: false,
          uniqueKeys: ['id'],
          fields: { id: { dataPath: 'id', type: 'string' } },
          request: { method: 'GET', path: '/items' },
          recordSelector: { recordPath: ['data'] },
        },
      },
    });
    // Build a context whose config sets AuthMethod=apikey and ApiKey=SECRET (mirror makeContext()'s AbstractContext construction).
    const context = makeSelectiveContext({
      AuthMethod: { value: 'apikey' },
      ApiKey: { value: 'SECRET' },
      Fields: { value: 'items id' },
    });
    const source = new DeclarativeSource(context, new ManifestParser().parse(manifest));
    source._delay = () => Promise.resolve();
    const out = await source.fetchData({
      nodeName: 'items',
      fields: ['id'],
      accountId: null,
      startDate: null,
      endDate: null,
    });
    assert.deepStrictEqual(
      out.map(r => r.id),
      ['1']
    );
    assert.ok(urls[0].includes('key=SECRET')); // the apiKey branch authorized the request
  });

  it('applies an exponential backoff that grows across attempts', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls <= 2)
        return {
          ok: false,
          status: 500,
          statusText: 'Err',
          headers: { get: () => null },
          async json() {
            return {};
          },
        };
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        async json() {
          return { data: [{ id: '1' }] };
        },
      };
    };
    const model = new ManifestParser().parse(
      errorManifest({
        responseFilters: [
          {
            httpCodes: [500],
            action: 'RETRY',
            backoff: { type: 'exponential', factor: 2, baseMs: 100 },
          },
        ],
      })
    );
    const source = new DeclarativeSource(makeContext(), model);
    const delays = [];
    source._delay = ms => {
      delays.push(ms);
      return Promise.resolve();
    };
    const out = await source.fetchData({
      nodeName: 'events',
      fields: ['id'],
      accountId: null,
      startDate: null,
      endDate: null,
    });
    assert.deepStrictEqual(delays, [100, 200]); // 100*2^0, 100*2^1
    assert.strictEqual(out[0].id, '1');
  });

  it('decodes a CSV response per recordSelector.responseFormat', async () => {
    const csvManifest = JSON.stringify({
      version: '1.0',
      name: 'CsvDemo',
      baseUrl: 'https://api.example.com',
      authentication: { type: 'apiKey', inject: { into: 'query', name: 'key', format: 'test' } },
      parameters: {},
      nodes: {
        rows: {
          destinationName: 'demo_rows',
          isTimeSeries: false,
          uniqueKeys: ['id'],
          fields: {
            id: { dataPath: 'id', type: 'integer' },
            name: { dataPath: 'name', type: 'string' },
          },
          request: { method: 'GET', path: '/export.csv' },
          recordSelector: { recordPath: [], responseFormat: 'csv' },
        },
      },
    });
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      async text() {
        return 'id,name\n1,Ann\n2,Bob\n';
      },
    });
    const model = new ManifestParser().parse(csvManifest);
    const source = new DeclarativeSource(makeContext(), model);
    const out = await source.fetchData({
      nodeName: 'rows',
      fields: ['id', 'name'],
      accountId: null,
      startDate: null,
      endDate: null,
    });
    assert.strictEqual(out.length, 2);
    assert.strictEqual(out[0].id, 1); // cast to integer by FieldCaster
    assert.strictEqual(out[0].name, 'Ann');
  });

  it('runs a substream: parent keys drive child requests', async () => {
    const subManifest = JSON.stringify({
      version: '1.0',
      name: 'SubDemo',
      baseUrl: 'https://api.example.com',
      authentication: { type: 'apiKey', inject: { into: 'query', name: 'key', format: 'test' } },
      parameters: {},
      nodes: {
        campaign_stats: {
          destinationName: 'demo_stats',
          isTimeSeries: false,
          uniqueKeys: ['campaign_id'],
          fields: {
            campaign_id: { dataPath: 'campaign_id', type: 'string' },
            impressions: { dataPath: 'impressions', type: 'integer' },
          },
          partitionRouter: {
            type: 'substream',
            parent: {
              request: { method: 'GET', path: '/campaigns' },
              recordPath: ['data'],
              key: 'id',
            },
            partitionField: 'campaign_id',
          },
          request: { method: 'GET', path: '/campaigns/{{ stream_slice.campaign_id }}/stats' },
          recordSelector: { recordPath: ['stats'] },
        },
      },
    });
    const urls = [];
    globalThis.fetch = async url => {
      const u = String(url);
      urls.push(u);
      if (u.includes('/campaigns?')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          async json() {
            return { data: [{ id: 'A' }, { id: 'B' }] };
          },
        };
      }
      const m = u.match(/\/campaigns\/([^/?]+)\/stats/);
      const id = m ? m[1] : '?';
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        async json() {
          return { stats: [{ campaign_id: id, impressions: '10' }] };
        },
      };
    };
    const model = new ManifestParser().parse(subManifest);
    const source = new DeclarativeSource(makeContext(), model);
    const out = await source.fetchData({
      nodeName: 'campaign_stats',
      fields: ['campaign_id', 'impressions'],
      accountId: null,
      startDate: null,
      endDate: null,
    });
    assert.strictEqual(out.length, 2);
    assert.deepStrictEqual(out.map(r => r.campaign_id).sort(), ['A', 'B']);
    assert.strictEqual(out[0].impressions, 10);
    assert.ok(
      urls.some(u => u.includes('/campaigns/A/stats')),
      `expected /campaigns/A/stats in ${urls}`
    );
    assert.ok(
      urls.some(u => u.includes('/campaigns/B/stats')),
      `expected /campaigns/B/stats in ${urls}`
    );
  });

  it('list-partitions a node over literal values, injecting the slice into the path', async () => {
    const requestedUrls = [];
    globalThis.fetch = async url => {
      requestedUrls.push(url);
      const country = url.includes('/US') ? 'US' : 'UK';
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        async json() {
          return { rows: [{ country, n: '1' }] };
        },
      };
    };
    const manifest = JSON.stringify({
      version: '1.0',
      name: 'L',
      baseUrl: 'https://api.example.com',
      authentication: { type: 'apiKey', inject: { into: 'query', name: 'k', format: 'x' } },
      parameters: {},
      nodes: {
        stats: {
          destinationName: 'd',
          isTimeSeries: false,
          uniqueKeys: ['country'],
          fields: {
            country: { dataPath: 'country', type: 'string' },
            n: { dataPath: 'n', type: 'integer' },
          },
          partitionRouter: { type: 'list', values: ['US', 'UK'], partitionField: 'country' },
          request: { method: 'GET', path: '/stats/{{ stream_slice.country }}' },
          recordSelector: { recordPath: ['rows'] },
        },
      },
    });
    const source = new DeclarativeSource(makeContext(), new ManifestParser().parse(manifest));
    source._delay = () => Promise.resolve();
    const out = await source.fetchData({
      nodeName: 'stats',
      fields: ['country', 'n'],
      accountId: null,
      startDate: null,
      endDate: null,
    });
    assert.deepStrictEqual(out.map(r => r.country).sort(), ['UK', 'US']);
    assert.ok(
      requestedUrls.some(u => u.includes('/stats/US')) &&
        requestedUrls.some(u => u.includes('/stats/UK'))
    );
  });

  it('applies recordFilter BEFORE transformations', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      async json() {
        return {
          rows: [
            { id: '1', keep: 'yes' },
            { id: '2', keep: 'no' },
            { id: '3', keep: 'yes' },
          ],
        };
      },
    });
    const manifest = JSON.stringify({
      version: '1.0',
      name: 'F',
      baseUrl: 'https://api.example.com',
      authentication: { type: 'apiKey', inject: { into: 'query', name: 'k', format: 'x' } },
      parameters: {},
      nodes: {
        items: {
          destinationName: 'd',
          isTimeSeries: false,
          uniqueKeys: ['id'],
          fields: { id: { dataPath: 'id', type: 'string' } },
          request: { method: 'GET', path: '/items' },
          recordSelector: { recordPath: ['rows'] },
          recordFilter: { path: ['keep'], operator: 'equals', value: 'yes' },
          transformations: [{ type: 'remove', field: 'keep' }],
        },
      },
    });
    const source = new DeclarativeSource(makeContext(), new ManifestParser().parse(manifest));
    source._delay = () => Promise.resolve();
    const out = await source.fetchData({
      nodeName: 'items',
      fields: ['id'],
      accountId: null,
      startDate: null,
      endDate: null,
    });
    assert.deepStrictEqual(
      out.map(r => r.id),
      ['1', '3']
    ); // the 'no' record was filtered out
    assert.ok(out.every(r => r.keep === undefined)); // transform ran after the filter
  });

  it('paginates a GraphQL node: cursor in body.variables.after, stop on hasNextPage', async () => {
    const bodies = [];
    globalThis.fetch = async (url, options) => {
      bodies.push(JSON.parse(options.body));
      const page = bodies.length;
      const hasNext = page < 2;
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        async json() {
          return {
            data: {
              issues: {
                nodes: [{ id: `n${page}` }],
                pageInfo: { endCursor: `C${page}`, hasNextPage: hasNext },
              },
            },
          };
        },
      };
    };
    const manifest = JSON.stringify({
      version: '1.0',
      name: 'G',
      baseUrl: 'https://api.example.com',
      authentication: {
        type: 'apiKey',
        inject: { into: 'header', name: 'Authorization', format: 'Bearer x' },
      },
      parameters: {},
      nodes: {
        issues: {
          destinationName: 'd',
          isTimeSeries: false,
          uniqueKeys: ['id'],
          fields: { id: { dataPath: 'id', type: 'string' } },
          request: {
            method: 'POST',
            path: '/graphql',
            body: {
              query:
                'query($after:String){issues(after:$after){nodes{id} pageInfo{endCursor hasNextPage}}}',
              variables: { after: null },
            },
          },
          recordSelector: { recordPath: ['data', 'issues', 'nodes'] },
          pagination: {
            type: 'cursor',
            cursor: { from: 'body', path: ['data', 'issues', 'pageInfo', 'endCursor'] },
            inject: { into: 'body', path: ['variables', 'after'] },
            stopCondition: { path: ['data', 'issues', 'pageInfo', 'hasNextPage'], equals: false },
          },
        },
      },
    });
    const source = new DeclarativeSource(makeContext(), new ManifestParser().parse(manifest));
    source._delay = () => Promise.resolve();
    const out = await source.fetchData({
      nodeName: 'issues',
      fields: ['id'],
      accountId: null,
      startDate: null,
      endDate: null,
    });
    assert.deepStrictEqual(
      out.map(r => r.id),
      ['n1', 'n2']
    );
    assert.strictEqual(bodies.length, 2);
    assert.strictEqual(bodies[1].variables.after, 'C1'); // page-2 request carried the page-1 cursor in the body
  });

  it('follows a Link rel="next" header across pages (RequestPath)', async () => {
    const urls = [];
    globalThis.fetch = async url => {
      urls.push(url);
      const page = urls.length;
      const link = page === 1 ? '<https://api.example.com/items?page=2>; rel="next"' : null;
      return {
        ok: true,
        status: 200,
        headers: { get: n => (n === 'Link' ? link : null) },
        async json() {
          return { data: [{ id: `i${page}` }] };
        },
      };
    };
    const manifest = JSON.stringify({
      version: '1.0',
      name: 'L',
      baseUrl: 'https://api.example.com',
      authentication: { type: 'apiKey', inject: { into: 'query', name: 'k', format: 'x' } },
      parameters: {},
      nodes: {
        items: {
          destinationName: 'd',
          isTimeSeries: false,
          uniqueKeys: ['id'],
          fields: { id: { dataPath: 'id', type: 'string' } },
          request: { method: 'GET', path: '/items' },
          recordSelector: { recordPath: ['data'] },
          pagination: {
            type: 'cursor',
            cursor: { from: 'header', header: 'Link', linkRel: 'next' },
            inject: { into: 'path' },
          },
        },
      },
    });
    const source = new DeclarativeSource(makeContext(), new ManifestParser().parse(manifest));
    source._delay = () => Promise.resolve();
    const out = await source.fetchData({
      nodeName: 'items',
      fields: ['id'],
      accountId: null,
      startDate: null,
      endDate: null,
    });
    assert.deepStrictEqual(
      out.map(r => r.id),
      ['i1', 'i2']
    );
    assert.ok(urls[1].includes('/items?page=2')); // followed the Link next URL
  });

  // The same Link-header flow, but with the node ALSO declaring the page parameter
  // statically. Re-applying `page=1` over the upstream's `page=2` re-requested page
  // one for every page: an identical-request loop that only ended at maxPages, wrote
  // one page of data over and over, and still reported the run COMPLETED.
  it('does not re-apply a static query parameter over the followed next-page URL', async () => {
    const urls = [];
    globalThis.fetch = async url => {
      urls.push(url);
      const onFirstPage = new URL(url).searchParams.get('page') === '1';
      return {
        ok: true,
        status: 200,
        headers: {
          get: n =>
            n === 'Link' && onFirstPage
              ? '<https://api.example.com/items?page=2>; rel="next"'
              : null,
        },
        async json() {
          return { data: [{ id: onFirstPage ? 'i1' : 'i2' }] };
        },
      };
    };
    const manifest = JSON.stringify({
      version: '1.0',
      name: 'L2',
      baseUrl: 'https://api.example.com',
      parameters: {},
      nodes: {
        items: {
          destinationName: 'd',
          isTimeSeries: false,
          uniqueKeys: ['id'],
          fields: { id: { dataPath: 'id', type: 'string' } },
          request: { method: 'GET', path: '/items', queryParameters: { page: '1' } },
          recordSelector: { recordPath: ['data'] },
          pagination: {
            type: 'cursor',
            cursor: { from: 'header', header: 'Link', linkRel: 'next' },
            inject: { into: 'path' },
          },
        },
      },
    });
    // maxPages caps the runaway so a regression fails fast instead of looping 10000x.
    const source = new DeclarativeSource(makeContext(), new ManifestParser().parse(manifest), {
      maxPages: 3,
    });
    source._delay = () => Promise.resolve();
    const out = await source.fetchData({
      nodeName: 'items',
      fields: ['id'],
      accountId: null,
      startDate: null,
      endDate: null,
    });
    assert.strictEqual(urls.length, 2, 'must stop after the real second page');
    assert.ok(urls[1].includes('page=2'), `second request kept page=1: ${urls[1]}`);
    assert.deepStrictEqual(
      out.map(r => r.id),
      ['i1', 'i2']
    );
  });

  it('honours maxPages limit passed as 3rd constructor arg', async () => {
    const paginatedManifest = JSON.stringify({
      version: '1.0',
      name: 'PaginatedDemo',
      baseUrl: 'https://api.example.com',
      authentication: { type: 'apiKey', inject: { into: 'query', name: 'key', format: 'test' } },
      parameters: {},
      nodes: {
        items: {
          destinationName: 'demo_items',
          isTimeSeries: false,
          uniqueKeys: ['id'],
          fields: {
            id: { apiName: 'id', type: 'string' },
          },
          request: { method: 'GET', path: '/items' },
          recordSelector: { recordPath: ['data'] },
          pagination: { type: 'offset', offsetParam: 'offset', pageSize: 3 },
        },
      },
    });

    globalThis.fetch = async url => {
      requestedUrls.push(url);
      return {
        ok: true,
        status: 200,
        async json() {
          return { data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
        },
      };
    };

    const model = new ManifestParser().parse(paginatedManifest);
    const context = new AbstractContext({
      source: { name: 'PaginatedDemo', config: {} },
      storage: { name: 'MockStorage', config: {} },
      runConfig: { type: 'INCREMENTAL', data: [], state: {} },
      env: { datamartId: 'dm', runId: 'run' },
    });

    const source = new DeclarativeSource(context, model, { maxPages: 1 });
    const rows = await source.fetchData({
      nodeName: 'items',
      fields: ['id'],
      accountId: null,
      startDate: null,
      endDate: null,
    });

    assert.strictEqual(rows.length, 3, 'maxPages:1 should return exactly one page of 3 rows');
  });
});

describe('DeclarativeSource raw sample emission', () => {
  const MANIFEST_SAMPLE = JSON.stringify({
    version: '1.0',
    name: 'S',
    baseUrl: 'https://api.example.com',
    parameters: {},
    nodes: {
      items: {
        request: { method: 'GET', path: '/items' },
        recordSelector: { recordPath: [] },
        fields: { id: { type: 'integer' } },
      },
    },
  });

  function makeSampleContext() {
    return new AbstractContext({
      source: { name: 'S', config: { Fields: { value: 'items id' } } },
      storage: { name: 'Mock', config: {} },
      runConfig: { type: 'INCREMENTAL', data: [], state: {} },
      env: { datamartId: 'dm', runId: 'run' },
    });
  }

  it('emits one SAMPLE event with raw (pre-cast) records when emitSample is set', async () => {
    const context = makeSampleContext();
    const model = new ManifestParser().parse(MANIFEST_SAMPLE);
    const source = new DeclarativeSource(context, model, { emitSample: true, sampleSize: 2 });
    source.urlFetchWithRetry = async () => ({
      json: async () => [{ id: 1, extra: { k: 'v' } }, { id: 2 }, { id: 3 }],
    });
    const events = [];
    context.emit = e => events.push(e.toJSON());

    await source.fetchData({
      nodeName: 'items',
      fields: ['id'],
      accountId: null,
      startDate: null,
      endDate: null,
    });

    const samples = events.filter(e => e.type === 'SAMPLE');
    assert.strictEqual(samples.length, 1);
    assert.strictEqual(samples[0].records.length, 2);
    assert.deepStrictEqual(samples[0].records[0], { id: 1, extra: { k: 'v' } });
  });

  it('emits SAMPLE only once even across multiple fetchData calls', async () => {
    const context = makeSampleContext();
    const model = new ManifestParser().parse(MANIFEST_SAMPLE);
    const source = new DeclarativeSource(context, model, { emitSample: true });
    source.urlFetchWithRetry = async () => ({ json: async () => [{ id: 1 }] });
    const events = [];
    context.emit = e => events.push(e.toJSON());
    await source.fetchData({
      nodeName: 'items',
      fields: ['id'],
      accountId: null,
      startDate: null,
      endDate: null,
    });
    await source.fetchData({
      nodeName: 'items',
      fields: ['id'],
      accountId: null,
      startDate: null,
      endDate: null,
    });
    assert.strictEqual(events.filter(e => e.type === 'SAMPLE').length, 1);
  });

  it('does not emit a SAMPLE event by default', async () => {
    const context = makeSampleContext();
    const model = new ManifestParser().parse(MANIFEST_SAMPLE);
    const source = new DeclarativeSource(context, model);
    source.urlFetchWithRetry = async () => ({ json: async () => [{ id: 1 }] });
    const events = [];
    context.emit = e => events.push(e.toJSON());
    await source.fetchData({
      nodeName: 'items',
      fields: ['id'],
      accountId: null,
      startDate: null,
      endDate: null,
    });
    assert.strictEqual(events.filter(e => e.type === 'SAMPLE').length, 0);
  });
});

describe('DeclarativeSource rate limiting', () => {
  const rlManifest = (extra = {}) =>
    JSON.stringify({
      version: '1.0',
      name: 'RL',
      baseUrl: 'https://api.example.com',
      parameters: {},
      nodes: {
        items: {
          destinationName: 'rl_items',
          isTimeSeries: false,
          uniqueKeys: ['id'],
          fields: { id: { dataPath: 'id', type: 'string' } },
          request: { method: 'GET', path: '/items' },
          recordSelector: { recordPath: ['data'] },
          pagination: { type: 'cursor', cursorPath: ['next'], cursorParam: 'after' },
        },
      },
      ...extra,
    });

  it('builds a SlidingWindowRateLimiter from model.rateLimit', () => {
    const model = new ManifestParser().parse(
      rlManifest({ rateLimit: { requests: 2, perSeconds: 60 } })
    );
    const source = new DeclarativeSource(makeContext(), model);
    assert.ok(source.rateLimiter instanceof SlidingWindowRateLimiter);
    assert.strictEqual(source.rateLimiter.requests, 2);
    assert.strictEqual(source.rateLimiter.windowMs, 60000);
  });

  it('uses an UnlimitedRateLimiter when no rateLimit is declared', () => {
    const model = new ManifestParser().parse(rlManifest());
    const source = new DeclarativeSource(makeContext(), model);
    assert.ok(source.rateLimiter instanceof UnlimitedRateLimiter);
  });

  it('consults the shared limiter once per page across pagination', async () => {
    globalThis.fetch = async url => {
      const ok = json => ({
        ok: true,
        status: 200,
        async json() {
          return json;
        },
      });
      if (String(url).includes('after=C2')) return ok({ data: [{ id: '2' }] });
      return ok({ data: [{ id: '1' }], next: 'C2' });
    };
    const model = new ManifestParser().parse(
      rlManifest({ rateLimit: { requests: 5, perSeconds: 60 } })
    );
    const source = new DeclarativeSource(makeContext(), model);
    let acquires = 0;
    const real = source.rateLimiter.acquire.bind(source.rateLimiter);
    source.rateLimiter.acquire = async () => {
      acquires += 1;
      return real();
    };
    await source.fetchData({
      nodeName: 'items',
      fields: ['id'],
      accountId: null,
      startDate: null,
      endDate: null,
    });
    assert.strictEqual(acquires, 2); // two pages → two acquire() calls on the one shared limiter
  });
});

describe('rows_extracted analytics', () => {
  const FILTER_MANIFEST = JSON.stringify({
    version: '1.0',
    name: 'Demo',
    baseUrl: 'https://api.example.com',
    parameters: { Fields: {} },
    nodes: {
      coins: {
        destinationName: 'demo_coins',
        fields: {
          id: { apiName: 'id', type: 'string' },
          cur: { apiName: 'cur', type: 'string' },
        },
        request: { method: 'GET', path: '/coins' },
        recordSelector: { recordPath: ['rows'] },
        recordFilter: { path: ['cur'], operator: 'equals', value: 'USD' },
      },
    },
  });

  it('emits rows_extracted = raw pre-filter count, tagged with node', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          rows: [
            { id: 'a', cur: 'USD' },
            { id: 'b', cur: 'USD' },
            { id: 'c', cur: 'EUR' },
          ],
        };
      },
    });
    const model = new ManifestParser().parse(FILTER_MANIFEST);
    const context = makeSelectiveContext({ Fields: { value: 'coins id, coins cur' } });
    const events = [];
    context.emit = e => events.push(e.toJSON ? e.toJSON() : e);
    const source = new DeclarativeSource(context, model);

    const data = await source.fetchData({
      nodeName: 'coins',
      fields: ['id', 'cur'],
      accountId: null,
      startDate: null,
      endDate: null,
    });

    assert.strictEqual(data.length, 2); // recordFilter kept only USD
    const extracted = events.filter(e => e.type === 'ANALYTICS' && e.metric === 'rows_extracted');
    assert.strictEqual(extracted.length, 1);
    assert.strictEqual(extracted[0].value, 3); // raw, BEFORE the filter
    // DestinationTableName is unset on a direct fetchData call → node tag falls back to nodeName
    assert.strictEqual(extracted[0].tags.node, 'coins');
  });

  it('does not emit rows_extracted when zero raw records', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      async json() {
        return { rows: [] };
      },
    });
    const model = new ManifestParser().parse(FILTER_MANIFEST);
    const context = makeSelectiveContext({ Fields: { value: 'coins id, coins cur' } });
    const events = [];
    context.emit = e => events.push(e.toJSON ? e.toJSON() : e);
    const source = new DeclarativeSource(context, model);

    await source.fetchData({
      nodeName: 'coins',
      fields: ['id', 'cur'],
      accountId: null,
      startDate: null,
      endDate: null,
    });

    assert.ok(!events.some(e => e.type === 'ANALYTICS' && e.metric === 'rows_extracted'));
  });
});

describe('DeclarativeSource oauth2 refresh-token rotation', () => {
  const oauthManifest = nodes =>
    JSON.stringify({
      version: '1.0',
      name: 'RotatingConn',
      baseUrl: 'https://api.example.com',
      parameters: {},
      authentication: {
        type: 'oauth2',
        tokenUrl: 'https://oauth.example.com/token',
        clientId: 'cid',
        clientSecret: 'sec',
        refreshToken: 'rt0',
        inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
      },
      nodes,
    });

  const oneNode = {
    items: {
      request: { method: 'GET', path: '/items' },
      recordSelector: { recordPath: ['data'] },
      fields: { id: { type: 'string' } },
    },
  };

  const twoNodes = {
    ...oneNode,
    items2: {
      request: { method: 'GET', path: '/items2' },
      recordSelector: { recordPath: ['data'] },
      fields: { id: { type: 'string' } },
    },
  };

  it('routes an oauth2 rotated refresh token to context.updateCredentials', async () => {
    const updates = [];
    const context = makeSelectiveContext({});
    context.updateCredentials = creds => updates.push(creds);

    const model = new ManifestParser().parse(oauthManifest(oneNode));
    const source = new DeclarativeSource(context, model);

    const tokenRefreshTokensSent = [];
    source.urlFetchWithRetry = async (url, options) => {
      if (String(url).startsWith('https://oauth.example.com')) {
        tokenRefreshTokensSent.push(new URLSearchParams(options.body).get('refresh_token'));
        return {
          json: async () => ({ access_token: 'AT', expires_in: 3600, refresh_token: 'rt-new' }),
        };
      }
      return { json: async () => ({ data: [{ id: '1' }] }) };
    };

    await source.fetchData({
      nodeName: 'items',
      fields: ['id'],
      accountId: null,
      startDate: null,
      endDate: null,
    });

    assert.deepStrictEqual(tokenRefreshTokensSent, ['rt0']); // node 1 sends the manifest-configured token
    assert.deepStrictEqual(updates, [{ generated_refresh_token: 'rt-new' }]);
  });

  it("a later node's fetch sends the rotated refresh token, not the stale configured one", async () => {
    // Reproduces the Task 1 review correction: the Authenticator is constructed
    // fresh inside fetchData for EVERY node (DeclarativeSource.js:150), so a
    // rotated token held only on that Authenticator instance dies at the node
    // boundary. The callback must also persist the rotation onto the run's
    // GeneratedRefreshToken context parameter so node 2's scope (rebuilt from
    // context in _baseScope) reads the live value instead of the stale 'rt0'
    // baked into the manifest.
    const updates = [];
    const context = makeSelectiveContext({});
    context.updateCredentials = creds => updates.push(creds);

    const model = new ManifestParser().parse(oauthManifest(twoNodes));
    const source = new DeclarativeSource(context, model);

    const tokenRefreshTokensSent = [];
    let tokenCalls = 0;
    source.urlFetchWithRetry = async (url, options) => {
      if (String(url).startsWith('https://oauth.example.com')) {
        tokenCalls++;
        tokenRefreshTokensSent.push(new URLSearchParams(options.body).get('refresh_token'));
        // Rotate again on the second call too, so a callback that only fires
        // once (e.g. wired on the wrong instance) would also be caught by the
        // updates assertion below, not just the token-sent assertion.
        const rotated = tokenCalls === 1 ? 'rt-new' : 'rt-newer';
        return {
          json: async () => ({
            access_token: `AT${tokenCalls}`,
            expires_in: 3600,
            refresh_token: rotated,
          }),
        };
      }
      return { json: async () => ({ data: [{ id: '1' }] }) };
    };

    // Node 1: fresh Authenticator sends the manifest-configured refresh token;
    // the provider rotates rt0 -> rt-new.
    await source.fetchData({
      nodeName: 'items',
      fields: ['id'],
      accountId: null,
      startDate: null,
      endDate: null,
    });
    // Node 2: ANOTHER fresh Authenticator is constructed. Before the fix, this
    // reads scope.parameters.GeneratedRefreshToken, which nothing had written,
    // so it resends the stale (and by now provider-consumed) 'rt0'.
    await source.fetchData({
      nodeName: 'items2',
      fields: ['id'],
      accountId: null,
      startDate: null,
      endDate: null,
    });

    assert.deepStrictEqual(tokenRefreshTokensSent, ['rt0', 'rt-new']); // node 2 must NOT resend rt0
    assert.deepStrictEqual(updates, [
      { generated_refresh_token: 'rt-new' },
      { generated_refresh_token: 'rt-newer' },
    ]); // both nodes' rotations reached context.updateCredentials
  });
});

// End-to-end companion to the AccountResolver unit tests: a manifest that
// declares accounts and a config that leaves the account parameter blank must
// fail the run BEFORE any request goes out, not import the API's default scope
// under a null account.
describe('blank account parameter fails the run instead of importing an unscoped page', () => {
  const accountManifest = accounts =>
    JSON.stringify({
      version: '1.0',
      name: 'AcctDemo',
      baseUrl: 'https://api.example.com',
      parameters: { AccountIDs: { requiredType: 'string' }, Fields: {} },
      ...(accounts ? { accounts } : {}),
      nodes: {
        events: {
          destinationName: 'demo_events',
          uniqueKeys: ['id'],
          fields: { id: { apiName: 'id', type: 'string' } },
          // The placeholder lands in queryParameters, which is exactly where
          // Requester._renderOptionalMap DROPS an unresolved value -- so a null
          // account produces an unfiltered request rather than an error.
          request: {
            method: 'GET',
            path: '/events',
            queryParameters: { account_id: '{{ account.id }}' },
          },
          recordSelector: { recordPath: ['rows'] },
        },
      },
    });

  const DECLARED = { from: '{{ parameters.AccountIDs }}', parse: { split: '[,;]', trim: true } };

  let originalFetch;
  let fetchCalls;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchCalls = [];
    globalThis.fetch = async url => {
      fetchCalls.push(String(url));
      return {
        ok: true,
        status: 200,
        async json() {
          return { rows: [{ id: 'unscoped' }] };
        },
      };
    };
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  for (const [label, value] of [
    ['empty string', ''],
    ['whitespace only', '   '],
  ]) {
    it(`fails the run and fetches nothing when AccountIDs is ${label}`, async () => {
      const model = new ManifestParser().parse(accountManifest(DECLARED));
      const context = makeSelectiveContext({
        AccountIDs: { value },
        Fields: { value: 'events id' },
      });
      const events = [];
      context.emit = e => events.push(e.toJSON ? e.toJSON() : e);
      const source = new DeclarativeSource(context, model);

      const error = await new AbstractConnector(context, source, MockStorage).run().then(
        () => null,
        e => e
      );
      assert.ok(error, 'a blank account list must fail the run');
      assert.match(error.message, /resolved to zero accounts/);
      assert.deepStrictEqual(fetchCalls, [], 'no request may go out for a blank account list');
      // _resolveAccounts flags this error `isWarning` (it is customer-actionable
      // -- a mis-set parameter, not a defect), so run() no longer announces it
      // as a CONTROL `failed`: that maps to ERROR severity host-side and would
      // page someone about a typo, duplicating the WARNING the runner files
      // through RunFailureReport. What must hold is that the run FAILS and never
      // claims success, which the thrown error and the absent `completed` event
      // below pin directly.
      assert.strictEqual(error.isWarning, true);
      const control = events.filter(e => e.type === 'CONTROL');
      assert.ok(
        !control.some(e => e.action === 'completed'),
        'a run that imported nothing must never report completed'
      );
      assert.ok(
        !control.some(e => e.action === 'failed'),
        'a flagged failure must not also be announced at ERROR severity'
      );
    });
  }

  it('makes exactly one pass with accountId null when the manifest has no accounts block', async () => {
    const model = new ManifestParser().parse(accountManifest(null));
    const context = makeSelectiveContext({
      AccountIDs: { value: '' },
      Fields: { value: 'events id' },
    });
    const source = new DeclarativeSource(context, model);
    assert.deepStrictEqual(source.getAccounts(context), [null]);

    const stores = [];
    class TrackingStorage extends MockStorage {
      constructor(...a) {
        super(...a);
        stores.push(this);
      }
    }
    await new AbstractConnector(context, source, TrackingStorage).run();

    assert.strictEqual(fetchCalls.length, 1);
    assert.ok(!fetchCalls[0].includes('account_id='), 'the dropped placeholder is expected here');
    assert.strictEqual(
      stores.reduce((n, s) => n + s.records.length, 0),
      1
    );
  });
});

// M1: `action: "IGNORE"` legitimately STOPS pagination (Airbyte low-code
// semantics), but it must not do so in total silence -- a 500 on page 2 of 50
// otherwise writes pages 1-1, checkpoints the day, and leaves run history with
// not one line about the missing rows.
describe('IGNORE-swallowed page error is reported, not silent', () => {
  const pagedManifest = JSON.stringify({
    version: '1.0',
    name: 'PagedErrDemo',
    baseUrl: 'https://api.example.com',
    parameters: { Fields: {} },
    nodes: {
      events: {
        destinationName: 'demo_events',
        uniqueKeys: ['id'],
        fields: { id: { apiName: 'id', type: 'string' } },
        request: { method: 'GET', path: '/events' },
        recordSelector: { recordPath: ['rows'] },
        pagination: { type: 'page', pageParam: 'page' },
        errorHandler: { responseFilters: [{ httpCodes: [500], action: 'IGNORE' }] },
      },
    },
  });

  let originalFetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('logs an INFO diagnostic naming the status, node and path, and keeps the earlier pages', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          async json() {
            return { rows: [{ id: 'p1a' }, { id: 'p1b' }] };
          },
        };
      }
      return {
        ok: false,
        status: 500,
        statusText: 'Server Error',
        headers: { get: () => null },
        async json() {
          return {};
        },
      };
    };
    const model = new ManifestParser().parse(pagedManifest);
    const context = makeSelectiveContext({ Fields: { value: 'events id' } });
    const logs = [];
    context.emit = e => {
      const j = e.toJSON ? e.toJSON() : e;
      if (j.type === 'LOG') logs.push(j);
    };
    const source = new DeclarativeSource(context, model);
    source._delay = () => Promise.resolve();

    const out = await source.fetchData({
      nodeName: 'events',
      fields: ['id'],
      accountId: null,
      startDate: null,
      endDate: null,
    });

    assert.deepStrictEqual(
      out.map(r => r.id),
      ['p1a', 'p1b'],
      'page 1 must still be returned'
    );
    const swallowed = logs.filter(l => l.message.includes('HTTP 500'));
    assert.strictEqual(swallowed.length, 1, `expected one IGNORE diagnostic, got ${logs.length}`);
    // INFO, not WARN: the manifest author asked for IGNORE, and WARN is the
    // backend's run-failure channel (see the H3 comments) -- a configured IGNORE
    // that failed the run would make the action itself meaningless.
    assert.strictEqual(swallowed[0].level, 'info');
    assert.ok(
      swallowed[0].message.includes('events'),
      `node name missing: ${swallowed[0].message}`
    );
    assert.ok(swallowed[0].message.includes('/events'), `path missing: ${swallowed[0].message}`);
  });

  it('logs nothing extra when every page succeeds', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        async json() {
          return { rows: calls === 1 ? [{ id: 'p1' }] : [] };
        },
      };
    };
    const model = new ManifestParser().parse(pagedManifest);
    const context = makeSelectiveContext({ Fields: { value: 'events id' } });
    const logs = [];
    context.emit = e => {
      const j = e.toJSON ? e.toJSON() : e;
      if (j.type === 'LOG') logs.push(j);
    };
    const source = new DeclarativeSource(context, model);

    await source.fetchData({
      nodeName: 'events',
      fields: ['id'],
      accountId: null,
      startDate: null,
      endDate: null,
    });
    assert.deepStrictEqual(logs, []);
  });
});

// The shape the no-code builder emits, and the shape the canonical MCP manifest
// example (§19.4) documents: an `incremental` block and no `isTimeSeries`
// anywhere. Asserting that it merely parses would prove nothing — a node that
// parses but is not treated as time-series is fetched by processCatalogNode with
// `startDate: null`, so the window is dropped and the run still reports success.
// This drives the whole path instead: parse, parameter registration, dispatch,
// and the requests that actually leave.
describe('DeclarativeSource time-series inference (builder-shaped manifest)', () => {
  const BUILDER_MANIFEST = JSON.stringify({
    version: '1.0',
    name: 'Builder',
    baseUrl: 'https://api.builder.test',
    parameters: { Fields: {} },
    nodes: {
      items: {
        // Deliberately NO isTimeSeries key — this is what the builder writes
        // (apps/web PaginationIncremental.test.tsx pins that it stays absent).
        incremental: {
          strategy: 'day-by-day',
          request: { into: 'query', startName: 'date', format: 'YYYY-MM-DD' },
        },
        uniqueKeys: ['date'],
        fields: {
          date: { apiName: 'date', type: 'date' },
          value: { apiName: 'value', type: 'number' },
        },
        request: { method: 'GET', path: '/items' },
        recordSelector: { recordPath: ['rows'] },
      },
    },
  });

  // A backfill run is the strictest available probe of the parameter half:
  // AbstractContext._validateRunConfig throws "does not support manual backfill"
  // for a configField that was never registered with the MANUAL_BACKFILL
  // attribute, so the run cannot reach a single request unless the parser
  // injected StartDate/EndDate for this manifest.
  const backfillContext = () =>
    new AbstractContext({
      source: { name: 'Builder', config: { Fields: { value: 'items date, items value' } } },
      storage: { name: 'MockStorage', config: {} },
      runConfig: {
        type: 'MANUAL_BACKFILL',
        data: [
          { configField: 'StartDate', value: '2026-03-01' },
          { configField: 'EndDate', value: '2026-03-03' },
        ],
      },
      env: { datamartId: 'dm', runId: 'run' },
    });

  let originalFetch;
  let requestedUrls;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    requestedUrls = [];
    globalThis.fetch = async url => {
      requestedUrls.push(String(url));
      return {
        ok: true,
        status: 200,
        async json() {
          return { rows: [{ date: '2026-03-01', value: '2' }] };
        },
      };
    };
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('compiles isTimeSeries from the incremental block alone', () => {
    const model = new ManifestParser().parse(BUILDER_MANIFEST);
    assert.strictEqual(
      model.nodes.items.isTimeSeries,
      undefined,
      'fixture must not declare isTimeSeries, or it proves nothing'
    );
    const source = new DeclarativeSource(backfillContext(), model);
    assert.strictEqual(source.fieldsSchema.items.isTimeSeries, true);
  });

  it('parses, registers StartDate/EndDate, and issues one date-windowed request per day', async () => {
    const model = new ManifestParser().parse(BUILDER_MANIFEST);

    assert.deepStrictEqual(model.parameters.StartDate.attributes, [
      'MANUAL_BACKFILL',
      'HIDE_IN_CONFIG_FORM',
    ]);
    assert.deepStrictEqual(model.parameters.EndDate.attributes, [
      'MANUAL_BACKFILL',
      'HIDE_IN_CONFIG_FORM',
    ]);

    const context = backfillContext();
    const stores = [];
    class TrackingStorage extends MockStorage {
      constructor(...a) {
        super(...a);
        stores.push(this);
      }
    }

    const source = new DeclarativeSource(context, model);
    await new AbstractConnector(context, source, TrackingStorage).run();

    // The window was actually applied: one request per calendar day of the
    // backfill, each carrying its own date. A node that lost its time-series
    // dispatch issues exactly one request here, with no `date` at all.
    assert.deepStrictEqual(
      requestedUrls.map(u => new URL(u).searchParams.get('date')),
      ['2026-03-01', '2026-03-02', '2026-03-03']
    );

    const total = stores.reduce((n, s) => n + s.records.length, 0);
    assert.strictEqual(total, 3, 'expected one row written per backfilled day');
  });
});
