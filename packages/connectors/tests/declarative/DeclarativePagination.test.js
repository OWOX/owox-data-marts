import assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { DeclarativeSource } from '../../src/Core/Declarative/DeclarativeSource.js';
import { ManifestParser } from '../../src/Core/Declarative/ManifestParser.js';
import { AbstractContext } from '../../src/Core/AbstractContext.js';
import { AbstractConnector } from '../../src/Core/AbstractConnector.js';

const MANIFEST = JSON.stringify({
  version: '1.0',
  name: 'Paged',
  baseUrl: 'https://api.example.com',
  authentication: {
    type: 'apiKey',
    inject: { into: 'query', name: 'k', format: '{{ parameters.ApiKey }}' },
  },
  parameters: { ApiKey: { requiredType: 'string', isRequired: true }, Fields: {} },
  nodes: {
    items: {
      destinationName: 'paged_items',
      isTimeSeries: false,
      uniqueKeys: ['id'],
      fields: { id: { apiName: 'id', type: 'string' } },
      request: { method: 'GET', path: '/items' },
      recordSelector: { recordPath: ['data'] },
      pagination: { type: 'cursor', cursorPath: ['paging', 'next'], cursorParam: 'after' },
    },
  },
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
      name: 'Paged',
      config: {
        ApiKey: { value: 'K' },
        Fields: { value: 'items id' },
      },
    },
    storage: { name: 'MockStorage', config: {} },
    runConfig: { type: 'INCREMENTAL', data: [], state: {} },
    env: { datamartId: 'dm', runId: 'run' },
  });
}

describe('Paginated connector (integration)', () => {
  let originalFetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = async url => {
      const ok = json => ({
        ok: true,
        status: 200,
        async json() {
          return json;
        },
      });
      if (url.includes('after=C2')) {
        return ok({ data: [{ id: '3' }], paging: {} });
      }
      return ok({ data: [{ id: '1' }, { id: '2' }], paging: { next: 'C2' } });
    };
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('accumulates records across two cursor pages into storage', async () => {
    const model = new ManifestParser().parse(MANIFEST);
    const context = makeContext();
    context.emit = () => {};

    const stores = [];
    class TrackingStorage extends MockStorage {
      constructor(...a) {
        super(...a);
        stores.push(this);
      }
    }

    const source = new DeclarativeSource(context, model);
    await new AbstractConnector(context, source, TrackingStorage).run();

    const ids = stores.flatMap(s => s.records.map(r => r.id)).sort();
    assert.deepStrictEqual(ids, ['1', '2', '3']);
  });
});
