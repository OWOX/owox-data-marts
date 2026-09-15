import assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { DeclarativeSource } from '../../src/Core/Declarative/DeclarativeSource.js';
import { ManifestParser } from '../../src/Core/Declarative/ManifestParser.js';
import { AbstractContext } from '../../src/Core/AbstractContext.js';
import { AbstractConnector } from '../../src/Core/AbstractConnector.js';

const MOLOCO = JSON.stringify({
  version: '1.0',
  name: 'MolocoCloud',
  baseUrl: 'https://api.moloco.cloud',
  authentication: {
    type: 'tokenExchange',
    exchange: {
      method: 'POST',
      url: 'https://api.moloco.cloud/cm/v1/auth/tokens',
      body: { api_key: '{{ parameters.ApiKey }}' },
      tokenPath: ['token'],
      ttlSeconds: 57600,
    },
    inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
  },
  parameters: {
    ApiKey: { requiredType: 'string', isRequired: true },
    AdAccountId: { requiredType: 'string', isRequired: true },
    Fields: {},
  },
  nodes: {
    performance_report: {
      destinationName: 'moloco_performance_report',
      isTimeSeries: true,
      uniqueKeys: ['date', 'campaign'],
      fields: {
        date: { apiName: 'date', type: 'date' },
        campaign: { apiName: 'campaign', type: 'string' },
        spend: { apiName: 'metric.spend', type: 'number' },
      },
      incremental: {
        strategy: 'range',
        cursorField: 'date',
        request: {
          into: 'body',
          startPath: ['date_range', 'start'],
          endPath: ['date_range', 'end'],
          format: 'YYYY-MM-DD',
        },
      },
      retriever: {
        type: 'async',
        submit: {
          method: 'POST',
          path: '/cm/v1/reports',
          body: { ad_account_id: '{{ account.id }}', dimensions: ['DATE', 'CAMPAIGN'] },
          jobIdPath: ['id'],
        },
        poll: {
          method: 'GET',
          path: '/cm/v1/reports/{{ job.id }}/status',
          statusPath: ['status'],
          readyValue: 'READY',
          failedValue: 'FAILED',
          resultUrlPath: ['location_json'],
          backoff: { initialMs: 1, maxMs: 1, maxAttempts: 5 },
        },
        download: { format: 'json', recordPath: ['rows'] },
      },
    },
  },
  accounts: { from: '{{ parameters.AdAccountId }}', parse: { split: '[,;]', trim: true } },
});

class MockStorage {
  constructor() {
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
      name: 'MolocoCloud',
      config: {
        ApiKey: { value: 'SECRET' },
        AdAccountId: { value: 'ACC1' },
        Fields: {
          value: 'performance_report date, performance_report campaign, performance_report spend',
        },
        LastRequestedDate: { value: '2026-01-01' },
        ReimportLookbackWindow: { value: 0 },
      },
    },
    storage: { name: 'MockStorage', config: {} },
    runConfig: { type: 'INCREMENTAL', data: [], state: {} },
    env: { datamartId: 'dm', runId: 'run' },
  });
}

describe('Moloco async connector (integration)', () => {
  let originalFetch;
  let pollCount;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    pollCount = 0;
    globalThis.fetch = async (url, options) => {
      const ok = json => ({
        ok: true,
        status: 200,
        async json() {
          return json;
        },
      });
      if (url.endsWith('/auth/tokens')) {
        assert.deepStrictEqual(JSON.parse(options.body), { api_key: 'SECRET' });
        return ok({ token: 'TKN' });
      }
      if (url.endsWith('/cm/v1/reports')) {
        const body = JSON.parse(options.body);
        assert.strictEqual(body.ad_account_id, 'ACC1');
        assert.strictEqual(body.date_range.start, '2026-01-01');
        return ok({ id: 'JOB9' });
      }
      if (url.includes('/reports/JOB9/status')) {
        pollCount++;
        return pollCount < 2
          ? ok({ status: 'PENDING' })
          : ok({ status: 'READY', location_json: 'https://cdn.moloco.example/JOB9.json' });
      }
      if (url === 'https://cdn.moloco.example/JOB9.json') {
        return ok({ rows: [{ date: '2026-01-01', campaign: 'C1', metric: { spend: '12.5' } }] });
      }
      throw new Error(`unexpected fetch ${url}`);
    };
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('runs the async report end-to-end through AbstractConnector', async () => {
    const model = new ManifestParser().parse(MOLOCO);
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
    assert.ok(total >= 1, 'expected at least one record');
    assert.strictEqual(stores[0].records[0].campaign, 'C1');
    assert.strictEqual(stores[0].records[0].spend, 12.5);

    const control = events.filter(e => e.type === 'CONTROL');
    assert.strictEqual(control[control.length - 1].action, 'completed');
  });
});
