import assert from 'node:assert';
import { describe, it } from 'node:test';
import { ManifestParser } from '../../src/Core/Declarative/ManifestParser.js';

const valid = {
  version: '1.0',
  name: 'Demo',
  baseUrl: 'https://api.example.com',
  authentication: {
    type: 'apiKey',
    inject: { into: 'query', name: 'k', format: '{{ parameters.AppId }}' },
  },
  parameters: { AppId: { requiredType: 'string', isRequired: true } },
  nodes: {
    rates: {
      destinationName: 'demo_rates',
      isTimeSeries: true,
      uniqueKeys: ['date'],
      fields: { date: { apiName: 'date', type: 'date' } },
      incremental: { strategy: 'day-by-day', cursorField: 'date' },
      request: { method: 'GET', path: '/x' },
      recordSelector: { recordPath: ['rates'] },
    },
  },
};

describe('ManifestParser', () => {
  it('parses a valid manifest and exposes allowedHosts', () => {
    const model = new ManifestParser().parse(JSON.stringify(valid));
    assert.strictEqual(model.name, 'Demo');
    assert.deepStrictEqual(model.allowedHosts, ['api.example.com']);
    assert.strictEqual(model.nodes.rates.isTimeSeries, true);
  });

  it('throws on invalid JSON', () => {
    assert.throws(() => new ManifestParser().parse('{bad'), /invalid JSON/);
  });

  it('throws when a required top-level key is missing', () => {
    const bad = { ...valid };
    delete bad.baseUrl;
    assert.throws(() => new ManifestParser().parse(JSON.stringify(bad)), /baseUrl/);
  });

  it('throws on an unknown authentication type', () => {
    const bad = JSON.parse(JSON.stringify(valid));
    bad.authentication.type = 'magic';
    assert.throws(
      () => new ManifestParser().parse(JSON.stringify(bad)),
      /authentication\.type "magic"/
    );
  });

  it('throws when a node is missing a request', () => {
    const bad = JSON.parse(JSON.stringify(valid));
    delete bad.nodes.rates.request;
    assert.throws(() => new ManifestParser().parse(JSON.stringify(bad)), /node "rates".*request/);
  });

  it('throws on a JSON value that is not an object (null / array / scalar)', () => {
    assert.throws(() => new ManifestParser().parse('null'), /must be a JSON object/);
    assert.throws(() => new ManifestParser().parse('[]'), /must be a JSON object/);
    assert.throws(() => new ManifestParser().parse('"x"'), /must be a JSON object/);
  });

  it('throws when nodes is not a non-null object', () => {
    const bad = JSON.parse(JSON.stringify(valid));
    bad.nodes = 42;
    assert.throws(
      () => new ManifestParser().parse(JSON.stringify(bad)),
      /"nodes" must be a non-null object/
    );
  });

  it('throws when parameters is null', () => {
    const bad = JSON.parse(JSON.stringify(valid));
    bad.parameters = null;
    assert.throws(
      () => new ManifestParser().parse(JSON.stringify(bad)),
      /"parameters" must be a non-null object/
    );
  });

  it('throws when a node is missing recordSelector', () => {
    const bad = JSON.parse(JSON.stringify(valid));
    delete bad.nodes.rates.recordSelector;
    assert.throws(
      () => new ManifestParser().parse(JSON.stringify(bad)),
      /node "rates".*recordSelector/
    );
  });

  it('throws on an unsupported retriever.type and incremental.strategy', () => {
    const badR = JSON.parse(JSON.stringify(valid));
    badR.nodes.rates.retriever = { type: 'streaming' };
    assert.throws(
      () => new ManifestParser().parse(JSON.stringify(badR)),
      /retriever\.type "streaming"/
    );

    const badS = JSON.parse(JSON.stringify(valid));
    badS.nodes.rates.incremental = { strategy: 'cursor' };
    assert.throws(
      () => new ManifestParser().parse(JSON.stringify(badS)),
      /incremental\.strategy "cursor"/
    );
  });

  it('collects allowedHosts from auth tokenUrl in addition to baseUrl', () => {
    const m = JSON.parse(JSON.stringify(valid));
    m.authentication = {
      type: 'bearer',
      tokenUrl: 'https://auth.example.org/token',
      inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
    };
    const model = new ManifestParser().parse(JSON.stringify(m));
    assert.ok(model.allowedHosts.includes('api.example.com'));
    assert.ok(model.allowedHosts.includes('auth.example.org'));
  });

  it('accepts tokenExchange auth and async retriever', () => {
    const m = JSON.parse(JSON.stringify(valid));
    m.authentication = {
      type: 'tokenExchange',
      exchange: {
        method: 'POST',
        url: 'https://api.example.com/auth',
        body: {},
        tokenPath: ['token'],
        ttlSeconds: 3600,
      },
      inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
    };
    m.nodes.rates.retriever = {
      type: 'async',
      submit: { method: 'POST', path: '/r', body: {}, jobIdPath: ['id'] },
      poll: {
        method: 'GET',
        path: '/r/{{ job.id }}/status',
        statusPath: ['status'],
        readyValue: 'READY',
        resultUrlPath: ['location_json'],
      },
      download: { format: 'json', recordPath: ['rows'] },
    };
    delete m.nodes.rates.request;
    const model = new ManifestParser().parse(JSON.stringify(m));
    assert.strictEqual(model.nodes.rates.retriever.type, 'async');
    assert.ok(model.allowedHosts.includes('api.example.com'));
  });

  it('throws when an async node is missing submit/poll/download', () => {
    const m = JSON.parse(JSON.stringify(valid));
    m.nodes.rates.retriever = { type: 'async', submit: { path: '/r' } };
    delete m.nodes.rates.request;
    assert.throws(() => new ManifestParser().parse(JSON.stringify(m)), /async.*requires.*poll/);
  });

  // The dot-string-vs-array mixup the reference calls "a common, silent bug". On
  // statusPath it is the expensive one: getPath iterates a string CHARACTER by
  // character, so every poll reads undefined, never matches readyValue or
  // failedValue, and the loop burns all 180 attempts (~44 min holding a
  // concurrency slot) before throwing "did not become ready".
  const asyncNodeWith = overrides => {
    const m = JSON.parse(JSON.stringify(valid));
    m.nodes.rates.retriever = {
      type: 'async',
      submit: { method: 'POST', path: '/r', body: {}, jobIdPath: ['id'] },
      poll: {
        method: 'GET',
        path: '/r/{{ job.id }}/status',
        statusPath: ['status'],
        readyValue: 'READY',
        resultUrlPath: ['location_json'],
      },
      download: { format: 'json', recordPath: ['rows'] },
    };
    delete m.nodes.rates.request;
    const r = m.nodes.rates.retriever;
    if (overrides.jobIdPath !== undefined) r.submit.jobIdPath = overrides.jobIdPath;
    if (overrides.statusPath !== undefined) r.poll.statusPath = overrides.statusPath;
    if (overrides.resultUrlPath !== undefined) r.poll.resultUrlPath = overrides.resultUrlPath;
    return m;
  };

  it('rejects a dot-string jobIdPath / statusPath / resultUrlPath on an async node', () => {
    assert.throws(
      () => new ManifestParser().parse(JSON.stringify(asyncNodeWith({ jobIdPath: 'data.id' }))),
      /retriever\.submit\.jobIdPath must be an array of keys.*not a string/s
    );
    assert.throws(
      () =>
        new ManifestParser().parse(JSON.stringify(asyncNodeWith({ statusPath: 'data.status' }))),
      /retriever\.poll\.statusPath must be an array of keys.*not a string/s
    );
    assert.throws(
      () =>
        new ManifestParser().parse(JSON.stringify(asyncNodeWith({ resultUrlPath: 'data.url' }))),
      /retriever\.poll\.resultUrlPath must be an array of keys.*not a string/s
    );
  });

  it('accepts array async paths, including a numeric segment', () => {
    assert.doesNotThrow(() => new ManifestParser().parse(JSON.stringify(asyncNodeWith({}))));
    assert.doesNotThrow(() =>
      new ManifestParser().parse(
        JSON.stringify(asyncNodeWith({ jobIdPath: ['data', 0, 'id'], statusPath: ['data', 0] }))
      )
    );
  });

  // errorHandler is wired for SYNC retrievers only (DeclarativeSource.fetchData
  // gates it on `retriever.type !== "async"`), so on an async node the author's
  // RETRY/IGNORE rules and waitTimeFromHeader backoff never run. Same policy the
  // parser already applies to partitionRouter + async: an inert block is an
  // error at publish, not a surprise in production.
  it('rejects an errorHandler on an async node', () => {
    const m = asyncNodeWith({});
    m.nodes.rates.errorHandler = {
      responseFilters: [{ httpCodes: [429], action: 'RETRY' }],
    };
    assert.throws(
      () => new ManifestParser().parse(JSON.stringify(m)),
      /errorHandler is not supported with an async retriever/
    );
  });

  it('accepts a known pagination.type on a sync node', () => {
    const m = JSON.parse(JSON.stringify(valid));
    m.nodes.rates.pagination = { type: 'cursor', cursorPath: ['next'], cursorParam: 'c' };
    const model = new ManifestParser().parse(JSON.stringify(m));
    assert.strictEqual(model.nodes.rates.pagination.type, 'cursor');
  });

  it('throws on an unknown pagination.type', () => {
    const m = JSON.parse(JSON.stringify(valid));
    m.nodes.rates.pagination = { type: 'keyset' };
    assert.throws(() => new ManifestParser().parse(JSON.stringify(m)), /pagination\.type "keyset"/);
  });

  it('accepts authentication.type "basic"', () => {
    const m = JSON.parse(JSON.stringify(valid));
    m.authentication = {
      type: 'basic',
      username: '{{ parameters.User }}',
      password: '{{ parameters.Pass }}',
    };
    const model = new ManifestParser().parse(JSON.stringify(m));
    assert.strictEqual(model.authentication.type, 'basic');
  });

  it('accepts a valid transformations array', () => {
    const m = JSON.parse(JSON.stringify(valid));
    m.nodes.rates.transformations = [
      { type: 'add', field: 'label', value: '{{ record.date }}' },
      { type: 'remove', field: 'debug' },
      { type: 'keysToLower' },
      { type: 'flatten', separator: '_' },
    ];
    const model = new ManifestParser().parse(JSON.stringify(m));
    assert.strictEqual(model.nodes.rates.transformations.length, 4);
  });

  it('throws on an unknown transformation type', () => {
    const m = JSON.parse(JSON.stringify(valid));
    m.nodes.rates.transformations = [{ type: 'magic' }];
    assert.throws(
      () => new ManifestParser().parse(JSON.stringify(m)),
      /unknown transformation type "magic"/
    );
  });

  it('throws when an "add" transformation is missing field or value', () => {
    const m = JSON.parse(JSON.stringify(valid));
    m.nodes.rates.transformations = [{ type: 'add', field: 'x' }];
    assert.throws(
      () => new ManifestParser().parse(JSON.stringify(m)),
      /"add" transformation requires field and value/
    );
  });

  it('throws when transformations is not an array', () => {
    const m = JSON.parse(JSON.stringify(valid));
    m.nodes.rates.transformations = { type: 'add' };
    assert.throws(
      () => new ManifestParser().parse(JSON.stringify(m)),
      /transformations must be an array/
    );
  });

  it('accepts a valid errorHandler', () => {
    const m = JSON.parse(JSON.stringify(valid));
    m.nodes.rates.errorHandler = {
      responseFilters: [
        { httpCodes: [429], action: 'RETRY' },
        { httpCodes: [404], action: 'IGNORE' },
      ],
      backoff: { type: 'waitTimeFromHeader', header: 'Retry-After' },
    };
    const model = new ManifestParser().parse(JSON.stringify(m));
    assert.strictEqual(model.nodes.rates.errorHandler.responseFilters.length, 2);
  });

  it('throws on an invalid errorHandler action', () => {
    const m = JSON.parse(JSON.stringify(valid));
    m.nodes.rates.errorHandler = { responseFilters: [{ httpCodes: [429], action: 'BOOM' }] };
    assert.throws(() => new ManifestParser().parse(JSON.stringify(m)), /invalid action "BOOM"/);
  });

  it('throws when errorHandler.responseFilters is not an array', () => {
    const m = JSON.parse(JSON.stringify(valid));
    m.nodes.rates.errorHandler = { responseFilters: { httpCodes: [429], action: 'RETRY' } };
    assert.throws(
      () => new ManifestParser().parse(JSON.stringify(m)),
      /responseFilters must be an array/
    );
  });

  it('throws on an unsupported errorHandler.backoff.type', () => {
    const m = JSON.parse(JSON.stringify(valid));
    m.nodes.rates.errorHandler = { responseFilters: [], backoff: { type: 'invalid' } };
    assert.throws(
      () => new ManifestParser().parse(JSON.stringify(m)),
      /backoff\.type must be one of/
    );
  });

  it('accepts a valid recordSelector.responseFormat', () => {
    const m = JSON.parse(JSON.stringify(valid));
    m.nodes.rates.recordSelector.responseFormat = 'csv';
    const model = new ManifestParser().parse(JSON.stringify(m));
    assert.strictEqual(model.nodes.rates.recordSelector.responseFormat, 'csv');
  });

  it('throws on an unsupported recordSelector.responseFormat', () => {
    const m = JSON.parse(JSON.stringify(valid));
    m.nodes.rates.recordSelector.responseFormat = 'xml';
    assert.throws(
      () => new ManifestParser().parse(JSON.stringify(m)),
      /responseFormat "xml" not supported/
    );
  });

  // RecordSelector does `Array.isArray(recordPath) ? recordPath : []`, so a string
  // is not an error — it silently becomes the EMPTY path, which selects the whole
  // response envelope as ONE record. Every declared field then reads null and every
  // real row is lost, with the run still reporting success.
  it('rejects a recordSelector.recordPath given as a string', () => {
    const m = JSON.parse(JSON.stringify(valid));
    m.nodes.rates.recordSelector.recordPath = 'rates';
    assert.throws(
      () => new ManifestParser().parse(JSON.stringify(m)),
      /recordSelector\.recordPath must be an array of keys.*not a string/s
    );
  });

  it('rejects a string recordPath on an async download and on a substream parent', () => {
    const asyncNode = JSON.parse(JSON.stringify(valid));
    asyncNode.nodes.rates.retriever = {
      type: 'async',
      submit: { method: 'POST', path: '/r', body: {}, jobIdPath: ['id'] },
      poll: { method: 'GET', path: '/r/1', statusPath: ['status'], readyValue: 'READY' },
      download: { format: 'json', recordPath: 'rows' },
    };
    assert.throws(
      () => new ManifestParser().parse(JSON.stringify(asyncNode)),
      /retriever\.download\.recordPath must be an array of keys/
    );

    const substream = JSON.parse(JSON.stringify(valid));
    substream.nodes.rates.partitionRouter = {
      type: 'substream',
      partitionField: 'account_id',
      parent: { request: { method: 'GET', path: '/accounts' }, key: 'id', recordPath: 'data' },
    };
    assert.throws(
      () => new ManifestParser().parse(JSON.stringify(substream)),
      /partitionRouter\.parent\.recordPath must be an array of keys/
    );
  });

  // A positional index into an array-shaped row ([[timestamp, price], ...]) is a
  // legitimate segment, so segments are NOT required to be strings.
  it('accepts an empty recordPath and one with a numeric segment', () => {
    const empty = JSON.parse(JSON.stringify(valid));
    empty.nodes.rates.recordSelector.recordPath = [];
    assert.doesNotThrow(() => new ManifestParser().parse(JSON.stringify(empty)));

    const indexed = JSON.parse(JSON.stringify(valid));
    indexed.nodes.rates.recordSelector.recordPath = ['result', 0, 'rows'];
    assert.doesNotThrow(() => new ManifestParser().parse(JSON.stringify(indexed)));
  });

  it('accepts a valid partitionRouter', () => {
    const m = JSON.parse(JSON.stringify(valid));
    m.nodes.rates.partitionRouter = {
      type: 'substream',
      parent: { request: { method: 'GET', path: '/p' }, recordPath: ['d'], key: 'id' },
      partitionField: 'pid',
    };
    m.nodes.rates.request = { method: 'GET', path: '/x/{{ stream_slice.pid }}' };
    const model = new ManifestParser().parse(JSON.stringify(m));
    assert.strictEqual(model.nodes.rates.partitionRouter.partitionField, 'pid');
  });

  it('throws on a partitionRouter missing parent.key', () => {
    const m = JSON.parse(JSON.stringify(valid));
    m.nodes.rates.partitionRouter = {
      type: 'substream',
      parent: { request: { method: 'GET', path: '/p' } },
      partitionField: 'pid',
    };
    assert.throws(
      () => new ManifestParser().parse(JSON.stringify(m)),
      /partitionRouter\.parent requires a key/
    );
  });

  it('throws on an invalid partitionRouter type (neither substream nor list)', () => {
    const m = JSON.parse(JSON.stringify(valid));
    m.nodes.rates.partitionRouter = { type: 'invalid', partitionField: 'pid' };
    assert.throws(
      () => new ManifestParser().parse(JSON.stringify(m)),
      /partitionRouter\.type must be "substream" or "list"/
    );
  });

  it('throws on a partitionRouter combined with an async retriever', () => {
    const m = JSON.parse(JSON.stringify(valid));
    m.nodes.rates.partitionRouter = {
      type: 'substream',
      parent: { request: { method: 'GET', path: '/p' }, key: 'id' },
      partitionField: 'pid',
    };
    m.nodes.rates.retriever = { type: 'async', submit: {}, poll: {}, download: {} };
    assert.throws(
      () => new ManifestParser().parse(JSON.stringify(m)),
      /partitionRouter is not supported with an async retriever/
    );
  });

  const ehManifest = errorHandler =>
    JSON.stringify({
      version: '1.0',
      name: 'Demo',
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
          errorHandler,
        },
      },
    });

  it('accepts a body-match filter and the four backoff types', () => {
    const m = ehManifest({
      responseFilters: [
        {
          httpCodes: [429],
          action: 'RETRY',
          backoff: { type: 'waitTimeFromHeader', header: 'Retry-After' },
        },
        { httpCodes: [400], messageContains: 'No changes', action: 'IGNORE' },
        { bodyMatch: { path: ['error', 'type'], equals: 'INVALID' }, action: 'FAIL' },
        {
          httpCodes: [503],
          action: 'RETRY',
          backoff: { type: 'exponential', factor: 2, baseMs: 1000 },
        },
      ],
      backoff: { type: 'waitUntilTimeFromHeader', header: 'X-Reset', regex: '(\\d+)', minMs: 1000 },
    });
    assert.doesNotThrow(() => new ManifestParser().parse(m));
  });

  it('still accepts the legacy status-code-only error handler', () => {
    const m = ehManifest({
      responseFilters: [{ httpCodes: [404], action: 'IGNORE' }],
      backoff: { type: 'waitTimeFromHeader' },
    });
    assert.doesNotThrow(() => new ManifestParser().parse(m));
  });

  it('rejects a filter with no condition', () => {
    assert.throws(
      () => new ManifestParser().parse(ehManifest({ responseFilters: [{ action: 'RETRY' }] })),
      /at least one of/
    );
  });

  it('rejects a bodyMatch without equals or contains', () => {
    assert.throws(
      () =>
        new ManifestParser().parse(
          ehManifest({ responseFilters: [{ bodyMatch: { path: ['a'] }, action: 'IGNORE' }] })
        ),
      /equals or contains/
    );
  });

  it('rejects an unknown backoff type and a constant without delayMs', () => {
    assert.throws(
      () =>
        new ManifestParser().parse(
          ehManifest({
            responseFilters: [{ httpCodes: [500], action: 'RETRY' }],
            backoff: { type: 'bogus' },
          })
        ),
      /backoff\.type/
    );
    assert.throws(
      () =>
        new ManifestParser().parse(
          ehManifest({
            responseFilters: [{ httpCodes: [500], action: 'RETRY', backoff: { type: 'constant' } }],
          })
        ),
      /constant backoff requires/
    );
  });

  it('rejects waitUntilTimeFromHeader without a header', () => {
    assert.throws(
      () =>
        new ManifestParser().parse(
          ehManifest({
            responseFilters: [{ httpCodes: [500], action: 'RETRY' }],
            backoff: { type: 'waitUntilTimeFromHeader' },
          })
        ),
      /waitUntilTimeFromHeader requires a header/
    );
  });

  it('rejects a non-string header on waitTimeFromHeader backoff', () => {
    assert.throws(
      () =>
        new ManifestParser().parse(
          ehManifest({
            responseFilters: [{ httpCodes: [429], action: 'RETRY' }],
            backoff: { type: 'waitTimeFromHeader', header: 42 },
          })
        ),
      /waitTimeFromHeader header must be a string/
    );
  });

  const nodeManifest = extra =>
    JSON.stringify({
      version: '1.0',
      name: 'Demo',
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
          ...extra,
        },
      },
    });

  it('accepts a valid list partitionRouter (values and valuesFromParameter)', () => {
    assert.doesNotThrow(() =>
      new ManifestParser().parse(
        nodeManifest({
          partitionRouter: { type: 'list', values: ['US', 'UK'], partitionField: 'country' },
        })
      )
    );
    assert.doesNotThrow(() =>
      new ManifestParser().parse(
        nodeManifest({
          partitionRouter: {
            type: 'list',
            valuesFromParameter: 'Accs',
            partitionField: 'account_id',
          },
        })
      )
    );
  });

  it('rejects a list partitionRouter missing partitionField, with both/neither source, or with a parent', () => {
    assert.throws(
      () =>
        new ManifestParser().parse(
          nodeManifest({ partitionRouter: { type: 'list', values: ['A'] } })
        ),
      /requires partitionField/
    );
    assert.throws(
      () =>
        new ManifestParser().parse(
          nodeManifest({
            partitionRouter: {
              type: 'list',
              values: ['A'],
              valuesFromParameter: 'X',
              partitionField: 'c',
            },
          })
        ),
      /exactly one of values/
    );
    assert.throws(
      () =>
        new ManifestParser().parse(
          nodeManifest({ partitionRouter: { type: 'list', partitionField: 'c' } })
        ),
      /exactly one of values/
    );
    assert.throws(
      () =>
        new ManifestParser().parse(
          nodeManifest({
            partitionRouter: { type: 'list', values: ['A'], partitionField: 'c', parent: {} },
          })
        ),
      /must not have a parent/
    );
    assert.throws(
      () =>
        new ManifestParser().parse(
          nodeManifest({ partitionRouter: { type: 'list', values: [], partitionField: 'c' } })
        ),
      /non-empty array of strings/
    );
  });

  it('accepts valid recordFilters and rejects malformed ones', () => {
    assert.doesNotThrow(() =>
      new ManifestParser().parse(
        nodeManifest({ recordFilter: { path: ['t'], operator: 'equals', value: 'GRID' } })
      )
    );
    assert.doesNotThrow(() =>
      new ManifestParser().parse(
        nodeManifest({ recordFilter: { path: ['m'], operator: 'isNotNull' } })
      )
    );
    assert.doesNotThrow(() =>
      new ManifestParser().parse(
        nodeManifest({
          recordFilter: { path: ['id'], operator: 'inList', valuesFromParameter: 'S' },
        })
      )
    );
    assert.throws(
      () =>
        new ManifestParser().parse(
          nodeManifest({ recordFilter: { path: ['t'], operator: 'bogus' } })
        ),
      /operator "bogus" is not supported/
    );
    assert.throws(
      () =>
        new ManifestParser().parse(
          nodeManifest({ recordFilter: { path: ['t'], operator: 'equals' } })
        ),
      /requires a string value/
    );
    assert.throws(
      () =>
        new ManifestParser().parse(
          nodeManifest({ recordFilter: { path: [], operator: 'isNull' } })
        ),
      /non-empty string path/
    );
    assert.throws(
      () =>
        new ManifestParser().parse(
          nodeManifest({
            recordFilter: {
              path: ['id'],
              operator: 'inList',
              value: '1',
              valuesFromParameter: 'S',
            },
          })
        ),
      /exactly one of value/
    );
  });

  const pgManifest = pagination =>
    JSON.stringify({
      version: '1.0',
      name: 'Demo',
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
          pagination,
        },
      },
    });

  it('accepts a GraphQL-style and a Link-header pagination', () => {
    assert.doesNotThrow(() =>
      new ManifestParser().parse(
        pgManifest({
          type: 'cursor',
          cursor: { from: 'body', path: ['data', 'pageInfo', 'endCursor'] },
          inject: { into: 'body', path: ['variables', 'after'] },
          stopCondition: { path: ['data', 'pageInfo', 'hasNextPage'], equals: false },
        })
      )
    );
    assert.doesNotThrow(() =>
      new ManifestParser().parse(
        pgManifest({
          type: 'cursor',
          cursor: { from: 'header', header: 'Link', linkRel: 'next' },
          inject: { into: 'path' },
        })
      )
    );
  });

  it('still accepts a legacy query cursor', () => {
    assert.doesNotThrow(() =>
      new ManifestParser().parse(
        pgManifest({ type: 'cursor', cursorPath: ['next'], cursorParam: 'cursor' })
      )
    );
  });

  it('rejects malformed inject / cursor / stopCondition', () => {
    assert.throws(
      () => new ManifestParser().parse(pgManifest({ type: 'cursor', inject: { into: 'bogus' } })),
      /inject\.into must be one of/
    );
    assert.throws(
      () => new ManifestParser().parse(pgManifest({ type: 'cursor', inject: { into: 'body' } })),
      /inject body requires/
    );
    assert.throws(
      () => new ManifestParser().parse(pgManifest({ type: 'cursor', inject: { into: 'header' } })),
      /requires a name/
    );
    assert.throws(
      () => new ManifestParser().parse(pgManifest({ type: 'cursor', cursor: { from: 'header' } })),
      /header requires a header name/
    );
    assert.throws(
      () =>
        new ManifestParser().parse(pgManifest({ type: 'cursor', cursor: { from: 'sideways' } })),
      /cursor\.from must be/
    );
    assert.throws(
      () =>
        new ManifestParser().parse(
          pgManifest({ type: 'cursor', stopCondition: { path: [], equals: false } })
        ),
      /stopCondition requires/
    );
    assert.throws(
      () =>
        new ManifestParser().parse(
          pgManifest({ type: 'cursor', stopCondition: { path: ['a'], equals: {} } })
        ),
      /stopCondition\.equals must be/
    );
  });

  it('rejects a body cursor with an empty path', () => {
    assert.throws(
      () =>
        new ManifestParser().parse(
          pgManifest({ type: 'cursor', cursor: { from: 'body', path: [] } })
        ),
      /cursor body requires a non-empty string path/
    );
  });

  // The three configurations below all PARSE cleanly today and then fail silently
  // at run time — the node imports page one only, or re-requests the same page
  // until maxPages — while the run still reports COMPLETED. Publish time is the
  // only moment an author can be told.
  it('rejects an offset pagination without a usable pageSize', () => {
    // Paginator: `if (!Number.isFinite(pageSize) || pageSize <= 0) return null`,
    // i.e. no second page at all.
    for (const pagination of [
      { type: 'offset', inject: { into: 'query', name: 'offset' } },
      { type: 'offset', pageSize: 0, inject: { into: 'query', name: 'offset' } },
      { type: 'offset', pageSize: '100', inject: { into: 'query', name: 'offset' } },
    ]) {
      assert.throws(
        () => new ManifestParser().parse(pgManifest(pagination)),
        /pagination type "offset" requires a positive numeric "pageSize"/
      );
    }
    assert.doesNotThrow(() =>
      new ManifestParser().parse(
        pgManifest({ type: 'offset', pageSize: 100, inject: { into: 'query', name: 'offset' } })
      )
    );
  });

  it('rejects a cursor pagination with no cursor block and no legacy cursorPath', () => {
    // Paginator._readCursor falls through to getPath(response, []), which returns
    // the WHOLE body — always truthy, so paging never terminates.
    assert.throws(
      () =>
        new ManifestParser().parse(
          pgManifest({ type: 'cursor', inject: { into: 'query', name: 'after' } })
        ),
      /pagination type "cursor" requires a "cursor" block/
    );
  });

  it('rejects a legacy cursorPath that is empty or not an array', () => {
    for (const cursorPath of [[], 'next', {}]) {
      const m = pgManifest({ type: 'cursor', cursorPath, cursorParam: 'c' });
      assert.throws(
        () => new ManifestParser().parse(m),
        /pagination "cursorPath" must be a non-empty array of string keys/
      );
    }
  });

  it('rejects a pagination with nothing naming where the value is injected', () => {
    // Paginator._inject falls back to the legacy param name; with neither it is
    // `undefined`, and the request goes out as "?undefined=2".
    assert.throws(
      () => new ManifestParser().parse(pgManifest({ type: 'page' })),
      /pagination type "page" requires an "inject" block \(or the legacy "pageParam"\)/
    );
    assert.throws(
      () => new ManifestParser().parse(pgManifest({ type: 'offset', pageSize: 50 })),
      /pagination type "offset" requires an "inject" block \(or the legacy "offsetParam"\)/
    );
    assert.throws(
      () => new ManifestParser().parse(pgManifest({ type: 'cursor', cursorPath: ['next'] })),
      /pagination type "cursor" requires an "inject" block \(or the legacy "cursorParam"\)/
    );
    // An inject block that needs no name (`into: "path"`) is still enough.
    assert.doesNotThrow(() =>
      new ManifestParser().parse(
        pgManifest({
          type: 'cursor',
          cursor: { from: 'header', header: 'Link', linkRel: 'next' },
          inject: { into: 'path' },
        })
      )
    );
  });

  const authManifest = authentication =>
    JSON.stringify({
      version: '1.0',
      name: 'Demo',
      baseUrl: 'https://api.example.com',
      authentication,
      parameters: {},
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

  it('accepts a valid selective authentication', () => {
    assert.doesNotThrow(() =>
      new ManifestParser().parse(
        authManifest({
          type: 'selective',
          selectionParameter: 'AuthMethod',
          authenticators: {
            apikey: { type: 'apiKey', inject: { into: 'query', name: 'k', format: 'x' } },
            basic: { type: 'basic', username: 'u' },
          },
        })
      )
    );
  });

  it('rejects malformed selective authentication', () => {
    assert.throws(
      () =>
        new ManifestParser().parse(
          authManifest({ type: 'selective', authenticators: { a: { type: 'apiKey', inject: {} } } })
        ),
      /requires a selectionParameter/
    );
    assert.throws(
      () =>
        new ManifestParser().parse(
          authManifest({ type: 'selective', selectionParameter: 'M', authenticators: {} })
        ),
      /non-empty authenticators/
    );
    assert.throws(
      () =>
        new ManifestParser().parse(
          authManifest({
            type: 'selective',
            selectionParameter: 'M',
            authenticators: { a: { type: 'weird' } },
          })
        ),
      /branch "a" has an unsupported type/
    );
    assert.throws(
      () =>
        new ManifestParser().parse(
          authManifest({
            type: 'selective',
            selectionParameter: 'M',
            authenticators: { a: { type: 'selective' } },
          })
        ),
      /branch "a" has an unsupported type/
    );
  });

  it('collects a selective tokenExchange branch host into the allowlist', () => {
    const model = new ManifestParser().parse(
      authManifest({
        type: 'selective',
        selectionParameter: 'AuthMethod',
        authenticators: {
          oauth: {
            type: 'tokenExchange',
            exchange: { url: 'https://auth.other.com/token', tokenPath: ['t'], body: {} },
            inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
          },
        },
      })
    );
    assert.ok(model.allowedHosts.includes('auth.other.com'));
  });
});

describe('ManifestParser rateLimit', () => {
  const base = (extra = {}) =>
    JSON.stringify({
      version: '1.0',
      name: 'RL',
      baseUrl: 'https://api.example.com',
      parameters: {},
      nodes: {
        items: {
          fields: { id: { type: 'string' } },
          request: { method: 'GET', path: '/x' },
          recordSelector: { recordPath: ['data'] },
        },
      },
      ...extra,
    });

  it('accepts a valid rateLimit and carries it onto the model', () => {
    const model = new ManifestParser().parse(
      base({ rateLimit: { requests: 100, perSeconds: 60 } })
    );
    assert.deepStrictEqual(model.rateLimit, { requests: 100, perSeconds: 60 });
  });

  it('leaves model.rateLimit undefined when absent', () => {
    const model = new ManifestParser().parse(base());
    assert.strictEqual(model.rateLimit, undefined);
  });

  it('rejects a non-object rateLimit', () => {
    assert.throws(
      () => new ManifestParser().parse(base({ rateLimit: 5 })),
      /rateLimit must be an object/
    );
  });

  it('rejects a non-positive or non-integer requests', () => {
    assert.throws(
      () => new ManifestParser().parse(base({ rateLimit: { requests: 0, perSeconds: 60 } })),
      /requests must be a positive integer/
    );
    assert.throws(
      () => new ManifestParser().parse(base({ rateLimit: { requests: 1.5, perSeconds: 60 } })),
      /requests must be a positive integer/
    );
  });

  it('rejects a non-positive perSeconds', () => {
    assert.throws(
      () => new ManifestParser().parse(base({ rateLimit: { requests: 5, perSeconds: 0 } })),
      /perSeconds must be a positive number/
    );
  });
});

describe('ManifestParser oauth2', () => {
  const base = auth => ({
    version: '1.0',
    name: 'OAuthConn',
    baseUrl: 'https://api.example.com',
    parameters: { ClientId: { isRequired: true } },
    authentication: auth,
    nodes: {
      items: {
        request: { path: '/items' },
        recordSelector: { fieldPath: ['data'] },
        fields: { id: { type: 'string' } },
      },
    },
  });

  const oauth = (over = {}) => ({
    type: 'oauth2',
    tokenUrl: 'https://oauth.example.com/token',
    clientId: '{{ parameters.ClientId }}',
    clientSecret: '{{ parameters.ClientSecret }}',
    refreshToken: '{{ parameters.RefreshToken }}',
    inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
    ...over,
  });

  it('accepts an oauth2 authenticator', () => {
    const model = new ManifestParser().parse(JSON.stringify(base(oauth())));
    assert.strictEqual(model.authentication.type, 'oauth2');
  });

  it('auto-registers GeneratedRefreshToken as a hidden secret parameter', () => {
    const model = new ManifestParser().parse(JSON.stringify(base(oauth())));
    const p = model.parameters.GeneratedRefreshToken;
    assert.ok(p, 'GeneratedRefreshToken should be auto-registered');
    assert.strictEqual(p.isRequired, false);
    assert.ok(p.attributes.includes('SECRET'));
    assert.ok(p.attributes.includes('HIDE_IN_CONFIG_FORM'));
  });

  it('auto-registers GeneratedRefreshToken for an oauth2 branch inside selective auth', () => {
    const model = new ManifestParser().parse(
      JSON.stringify(
        base({
          type: 'selective',
          selectionParameter: 'AuthType',
          authenticators: {
            oauth2: oauth(),
            key: {
              type: 'apiKey',
              inject: { into: 'query', name: 'k', format: '{{ parameters.ClientId }}' },
            },
          },
        })
      )
    );
    assert.ok(model.parameters.GeneratedRefreshToken);
  });

  it('rejects an invalid oauth2 branch inside selective authentication', () => {
    assert.throws(
      () =>
        new ManifestParser().parse(
          JSON.stringify(
            base({
              type: 'selective',
              selectionParameter: 'AuthType',
              authenticators: {
                oauth2: oauth({ tokenUrl: undefined }),
                key: {
                  type: 'apiKey',
                  inject: { into: 'query', name: 'k', format: '{{ parameters.ClientId }}' },
                },
              },
            })
          )
        ),
      /authentication\.authenticators\.oauth2 oauth2 requires "tokenUrl"/
    );
  });

  it('does not register GeneratedRefreshToken when no authenticator is oauth2', () => {
    const model = new ManifestParser().parse(
      JSON.stringify(
        base({
          type: 'bearer',
          inject: {
            into: 'header',
            name: 'Authorization',
            format: 'Bearer {{ parameters.ClientId }}',
          },
        })
      )
    );
    assert.strictEqual(model.parameters.GeneratedRefreshToken, undefined);
  });

  it('rejects oauth2 without tokenUrl', () => {
    assert.throws(
      () => new ManifestParser().parse(JSON.stringify(base(oauth({ tokenUrl: undefined })))),
      /tokenUrl/
    );
  });

  it('rejects oauth2 without clientId', () => {
    assert.throws(
      () => new ManifestParser().parse(JSON.stringify(base(oauth({ clientId: undefined })))),
      /clientId/
    );
  });

  it('rejects oauth2 without clientSecret', () => {
    assert.throws(
      () => new ManifestParser().parse(JSON.stringify(base(oauth({ clientSecret: undefined })))),
      /clientSecret/
    );
  });

  it('rejects an unknown grantType', () => {
    assert.throws(
      () => new ManifestParser().parse(JSON.stringify(base(oauth({ grantType: 'password' })))),
      /grantType/
    );
  });

  it('rejects refresh_token grant without refreshToken', () => {
    assert.throws(
      () => new ManifestParser().parse(JSON.stringify(base(oauth({ refreshToken: undefined })))),
      /refreshToken/
    );
  });

  it('allows client_credentials without refreshToken', () => {
    const model = new ManifestParser().parse(
      JSON.stringify(base(oauth({ grantType: 'client_credentials', refreshToken: undefined })))
    );
    assert.strictEqual(model.authentication.grantType, 'client_credentials');
  });

  it('allowlists the oauth2 tokenUrl host', () => {
    const model = new ManifestParser().parse(JSON.stringify(base(oauth())));
    assert.ok(model.allowedHosts.includes('oauth.example.com'));
  });

  it('rejects a non-positive or non-numeric ttlSeconds', () => {
    assert.throws(
      () => new ManifestParser().parse(JSON.stringify(base(oauth({ ttlSeconds: 0 })))),
      /authentication oauth2 ttlSeconds must be a positive number/
    );
    assert.throws(
      () => new ManifestParser().parse(JSON.stringify(base(oauth({ ttlSeconds: -30 })))),
      /authentication oauth2 ttlSeconds must be a positive number/
    );
    assert.throws(
      () => new ManifestParser().parse(JSON.stringify(base(oauth({ ttlSeconds: 'soon' })))),
      /authentication oauth2 ttlSeconds must be a positive number/
    );
  });

  it('accepts a positive ttlSeconds as a cache-TTL fallback', () => {
    const model = new ManifestParser().parse(JSON.stringify(base(oauth({ ttlSeconds: 120 }))));
    assert.strictEqual(model.authentication.ttlSeconds, 120);
  });
});

describe('ManifestParser standard advanced params', () => {
  it('injects CreateEmptyTables + ReimportLookbackWindow with defaults', () => {
    const m = new ManifestParser().parse(
      JSON.stringify({
        version: '1.0',
        name: 'X',
        baseUrl: 'https://api.x.com',
        parameters: {},
        nodes: {
          a: {
            request: { method: 'GET', path: '/a' },
            recordSelector: { recordPath: [] },
            fields: { id: { type: 'integer' } },
          },
        },
      })
    );
    assert.strictEqual(m.parameters.CreateEmptyTables.default, true);
    assert.deepStrictEqual(m.parameters.CreateEmptyTables.attributes, ['ADVANCED']);
    assert.strictEqual(m.parameters.ReimportLookbackWindow.default, 2);
    assert.strictEqual(m.parameters.ReimportLookbackWindow.requiredType, 'number');
    assert.deepStrictEqual(m.parameters.ReimportLookbackWindow.attributes, ['ADVANCED']);
    // No isTimeSeries node => no backfill dates
    assert.strictEqual(m.parameters.StartDate, undefined);
    assert.strictEqual(m.parameters.EndDate, undefined);
  });

  // A node is time-series when it says `isTimeSeries: true` OR when it declares
  // an `incremental` strategy other than `none` (Declarative/timeSeries.js).
  // ManifestParser gates StartDate/EndDate on that shared predicate and
  // DeclarativeSource._compileNodes compiles `schema.isTimeSeries` from it, so
  // the parameters a node gets and the dispatch it takes cannot disagree.

  it('injects StartDate/EndDate when a node has isTimeSeries: true and NO incremental block', () => {
    // This is the crash case the fix repairs: a time-series node with no
    // incremental strategy still reaches processTimeSeriesNode/getDateRange
    // at runtime, so it still needs StartDate/EndDate.
    const m = new ManifestParser().parse(
      JSON.stringify({
        version: '1.0',
        name: 'X',
        baseUrl: 'https://api.x.com',
        parameters: {},
        nodes: {
          a: {
            isTimeSeries: true,
            request: { method: 'GET', path: '/a' },
            recordSelector: { recordPath: [] },
            fields: { id: { type: 'integer' } },
          },
        },
      })
    );
    assert.deepStrictEqual(m.parameters.StartDate.attributes, [
      'MANUAL_BACKFILL',
      'HIDE_IN_CONFIG_FORM',
    ]);
    assert.deepStrictEqual(m.parameters.EndDate.attributes, [
      'MANUAL_BACKFILL',
      'HIDE_IN_CONFIG_FORM',
    ]);
    assert.strictEqual(m.parameters.StartDate.requiredType, 'date');
    assert.strictEqual(m.parameters.EndDate.requiredType, 'date');
  });

  it('injects StartDate/EndDate when a node has isTimeSeries: true and an incremental strategy', () => {
    const m = new ManifestParser().parse(
      JSON.stringify({
        version: '1.0',
        name: 'X',
        baseUrl: 'https://api.x.com',
        parameters: {},
        nodes: {
          a: {
            isTimeSeries: true,
            incremental: {
              strategy: 'day-by-day',
              request: { into: 'query', startName: 'start', format: 'YYYY-MM-DD' },
            },
            request: { method: 'GET', path: '/a' },
            recordSelector: { recordPath: [] },
            fields: { id: { type: 'integer' } },
          },
        },
      })
    );
    assert.deepStrictEqual(m.parameters.StartDate.attributes, [
      'MANUAL_BACKFILL',
      'HIDE_IN_CONFIG_FORM',
    ]);
    assert.deepStrictEqual(m.parameters.EndDate.attributes, [
      'MANUAL_BACKFILL',
      'HIDE_IN_CONFIG_FORM',
    ]);
    assert.strictEqual(m.parameters.StartDate.requiredType, 'date');
  });

  // The builder's exact output shape: it writes `incremental` and never writes
  // `isTimeSeries` (apps/web PaginationIncremental.test.tsx, "selecting an
  // incremental strategy does not change isTimeSeries"), as does the canonical
  // MCP manifest example §19.4. Inference is what makes those manifests work, so
  // the backfill parameters have to follow it — a node walked day by day at run
  // time with no StartDate registered cannot be backfilled at all, because
  // AbstractContext._validateRunConfig refuses a MANUAL_BACKFILL run whose field
  // was never declared.
  //
  // `isTimeSeries: false` does not veto it either: `false` is the
  // absence-equivalent default, `incremental` is a positive declaration.
  it('injects StartDate/EndDate when a node declares incremental and isTimeSeries is absent or false', () => {
    const manifest = extra => ({
      version: '1.0',
      name: 'X',
      baseUrl: 'https://api.x.com',
      parameters: {},
      nodes: {
        a: {
          ...extra,
          incremental: {
            strategy: 'day-by-day',
            request: { into: 'query', startName: 'start', format: 'YYYY-MM-DD' },
          },
          request: { method: 'GET', path: '/a' },
          recordSelector: { recordPath: [] },
          fields: { id: { type: 'integer' } },
        },
      },
    });

    for (const extra of [{}, { isTimeSeries: false }]) {
      const m = new ManifestParser().parse(JSON.stringify(manifest(extra)));
      assert.deepStrictEqual(m.parameters.StartDate.attributes, [
        'MANUAL_BACKFILL',
        'HIDE_IN_CONFIG_FORM',
      ]);
      assert.deepStrictEqual(m.parameters.EndDate.attributes, [
        'MANUAL_BACKFILL',
        'HIDE_IN_CONFIG_FORM',
      ]);
      assert.strictEqual(m.parameters.StartDate.requiredType, 'date');
      assert.strictEqual(m.parameters.EndDate.requiredType, 'date');
    }
  });

  // `strategy: "none"` is a positive statement that there is NO date window, so
  // it must not infer anything — otherwise every catalog node that spells the
  // default out would start collecting backfill parameters it never reads.
  it('does not infer time-series from an incremental block whose strategy is "none"', () => {
    const m = new ManifestParser().parse(
      JSON.stringify({
        version: '1.0',
        name: 'X',
        baseUrl: 'https://api.x.com',
        parameters: {},
        nodes: {
          a: {
            incremental: { strategy: 'none' },
            request: { method: 'GET', path: '/a' },
            recordSelector: { recordPath: [] },
            fields: { id: { type: 'integer' } },
          },
        },
      })
    );
    assert.strictEqual(m.parameters.StartDate, undefined);
    assert.strictEqual(m.parameters.EndDate, undefined);
  });

  // The one pairing inference cannot resolve: isFullRefresh wins in
  // AbstractConnector._planNodes, so the node is handed to processFullRefreshNode
  // and fetchData is called with `startDate: null, endDate: null` — the
  // incremental block is inert and nothing says so at run time. Both sides are
  // stated positively and mean opposite things, so it is refused rather than
  // guessed at.
  it('rejects a node that declares both incremental and isFullRefresh', () => {
    const manifest = extra => ({
      version: '1.0',
      name: 'X',
      baseUrl: 'https://api.x.com',
      parameters: {},
      nodes: {
        a: {
          ...extra,
          incremental: {
            strategy: 'day-by-day',
            request: { into: 'query', startName: 'start', format: 'YYYY-MM-DD' },
          },
          request: { method: 'GET', path: '/a' },
          recordSelector: { recordPath: [] },
          fields: { id: { type: 'integer' } },
        },
      },
    });

    for (const extra of [{ isFullRefresh: true }, { isTimeSeries: true, isFullRefresh: true }]) {
      assert.throws(
        () => new ManifestParser().parse(JSON.stringify(manifest(extra))),
        /node "a" declares both "incremental" and "isFullRefresh", which are mutually exclusive/
      );
    }

    // isFullRefresh on its own, with no date window asked for, stays legal.
    assert.doesNotThrow(() =>
      new ManifestParser().parse(
        JSON.stringify({
          version: '1.0',
          name: 'X',
          baseUrl: 'https://api.x.com',
          parameters: {},
          nodes: {
            a: {
              isFullRefresh: true,
              request: { method: 'GET', path: '/a' },
              recordSelector: { recordPath: [] },
              fields: { id: { type: 'integer' } },
            },
          },
        })
      )
    );
  });

  it('still accepts a non-time-series node that declares no incremental block', () => {
    const m = new ManifestParser().parse(
      JSON.stringify({
        version: '1.0',
        name: 'X',
        baseUrl: 'https://api.x.com',
        parameters: {},
        nodes: {
          a: {
            isTimeSeries: false,
            request: { method: 'GET', path: '/a' },
            recordSelector: { recordPath: [] },
            fields: { id: { type: 'integer' } },
          },
        },
      })
    );
    assert.strictEqual(m.parameters.StartDate, undefined);
    assert.strictEqual(m.parameters.EndDate, undefined);
  });

  it('aggregates isTimeSeries across nodes: injects dates when only one of several nodes is time-series', () => {
    const m = new ManifestParser().parse(
      JSON.stringify({
        version: '1.0',
        name: 'X',
        baseUrl: 'https://api.x.com',
        parameters: {},
        nodes: {
          a: {
            request: { method: 'GET', path: '/a' },
            recordSelector: { recordPath: [] },
            fields: { id: { type: 'integer' } },
          },
          b: {
            isTimeSeries: true,
            request: { method: 'GET', path: '/b' },
            recordSelector: { recordPath: [] },
            fields: { id: { type: 'integer' } },
          },
        },
      })
    );
    assert.strictEqual(m.parameters.StartDate.requiredType, 'date');
    assert.strictEqual(m.parameters.EndDate.requiredType, 'date');
  });

  it('does not override author-declared standard params (CreateEmptyTables, ReimportLookbackWindow)', () => {
    const m = new ManifestParser().parse(
      JSON.stringify({
        version: '1.0',
        name: 'X',
        baseUrl: 'https://api.x.com',
        parameters: {
          CreateEmptyTables: { requiredType: 'boolean', default: false },
          ReimportLookbackWindow: { requiredType: 'number', default: 7 },
        },
        nodes: {
          a: {
            request: { method: 'GET', path: '/a' },
            recordSelector: { recordPath: [] },
            fields: { id: { type: 'integer' } },
          },
        },
      })
    );
    assert.strictEqual(m.parameters.CreateEmptyTables.default, false); // preserved
    assert.strictEqual(m.parameters.ReimportLookbackWindow.default, 7); // preserved (per-key guard)
  });
});

// A custom connector's specification is user-authored JSON, and the entire
// secret pipeline (externalising credentials out of `data_mart.definition`,
// masking them on the viewer-readable GET) keys off the SECRET attribute in
// that specification. An author who forgets it leaks the credential silently,
// so the parser marks every parameter the manifest interpolates into a
// credential position of `authentication` on the author's behalf.
describe('ManifestParser authentication secrets', () => {
  const base = (authentication, parameters = {}) => ({
    version: '1.0',
    name: 'SecretConn',
    baseUrl: 'https://api.example.com',
    authentication,
    parameters,
    nodes: {
      items: {
        request: { method: 'GET', path: '/items' },
        recordSelector: { recordPath: [] },
        fields: { id: { type: 'string' } },
      },
    },
  });

  const parse = manifest => new ManifestParser().parse(JSON.stringify(manifest));
  const attrs = (model, name) => model.parameters[name]?.attributes ?? [];

  it('marks a bearer token parameter SECRET even when the author declared no attributes', () => {
    const model = parse(
      base(
        {
          type: 'bearer',
          inject: {
            into: 'header',
            name: 'Authorization',
            format: 'Bearer {{ parameters.Token }}',
          },
        },
        { Token: { requiredType: 'string', isRequired: true } }
      )
    );
    assert.deepStrictEqual(attrs(model, 'Token'), ['SECRET']);
  });

  it('marks an apiKey value parameter SECRET but leaves the header name alone', () => {
    const model = parse(
      base(
        {
          type: 'apiKey',
          inject: {
            into: 'header',
            name: '{{ parameters.HeaderName }}',
            format: '{{ parameters.ApiKey }}',
          },
        },
        {
          ApiKey: { requiredType: 'string', isRequired: true },
          HeaderName: { requiredType: 'string' },
        }
      )
    );
    assert.deepStrictEqual(attrs(model, 'ApiKey'), ['SECRET']);
    assert.deepStrictEqual(attrs(model, 'HeaderName'), []);
  });

  it('marks a basic password SECRET and leaves the username unmarked', () => {
    const model = parse(
      base(
        {
          type: 'basic',
          username: '{{ parameters.User }}',
          password: '{{ parameters.Password }}',
        },
        {
          User: { requiredType: 'string', isRequired: true },
          Password: { requiredType: 'string', isRequired: true },
        }
      )
    );
    assert.deepStrictEqual(attrs(model, 'Password'), ['SECRET']);
    assert.deepStrictEqual(attrs(model, 'User'), []);
  });

  it('marks every parameter in a tokenExchange request body SECRET, including nested ones', () => {
    const model = parse(
      base(
        {
          type: 'tokenExchange',
          exchange: {
            url: 'https://auth.example.com/token',
            method: 'POST',
            tokenPath: ['access_token'],
            body: {
              client_id: '{{ parameters.ClientId }}',
              credentials: { secret: '{{ parameters.ClientSecret }}' },
              tokens: ['{{ parameters.RefreshToken }}'],
            },
          },
          inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
        },
        {
          ClientId: { requiredType: 'string' },
          ClientSecret: { requiredType: 'string' },
          RefreshToken: { requiredType: 'string' },
        }
      )
    );
    // Everything the exchange body carries is credential material: the parser
    // cannot tell a client id sent alongside a secret from the secret itself,
    // and the body is what buys the token.
    assert.deepStrictEqual(attrs(model, 'ClientSecret'), ['SECRET']);
    assert.deepStrictEqual(attrs(model, 'RefreshToken'), ['SECRET']);
    assert.deepStrictEqual(attrs(model, 'ClientId'), ['SECRET']);
  });

  it('marks an oauth2 clientSecret and refreshToken SECRET, but not clientId or scope', () => {
    const model = parse(
      base(
        {
          type: 'oauth2',
          tokenUrl: 'https://oauth.example.com/token',
          clientId: '{{ parameters.ClientId }}',
          clientSecret: '{{ parameters.ClientSecret }}',
          refreshToken: '{{ parameters.RefreshToken }}',
          scope: '{{ parameters.Scope }}',
          inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
        },
        {
          ClientId: { requiredType: 'string' },
          ClientSecret: { requiredType: 'string' },
          RefreshToken: { requiredType: 'string' },
          Scope: { requiredType: 'string' },
        }
      )
    );
    assert.deepStrictEqual(attrs(model, 'ClientSecret'), ['SECRET']);
    assert.deepStrictEqual(attrs(model, 'RefreshToken'), ['SECRET']);
    assert.deepStrictEqual(attrs(model, 'ClientId'), []);
    assert.deepStrictEqual(attrs(model, 'Scope'), []);
  });

  it('marks the credentials of every selective branch and leaves the selector parameter alone', () => {
    const model = parse(
      base(
        {
          type: 'selective',
          selectionParameter: 'AuthType',
          authenticators: {
            key: {
              type: 'apiKey',
              inject: { into: 'query', name: 'k', format: '{{ parameters.ApiKey }}' },
            },
            oauth2: {
              type: 'oauth2',
              tokenUrl: 'https://oauth.example.com/token',
              clientId: '{{ parameters.ClientId }}',
              clientSecret: '{{ parameters.ClientSecret }}',
              refreshToken: '{{ parameters.RefreshToken }}',
              inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
            },
          },
        },
        {
          AuthType: { requiredType: 'string' },
          ApiKey: { requiredType: 'string' },
          ClientId: { requiredType: 'string' },
          ClientSecret: { requiredType: 'string' },
          RefreshToken: { requiredType: 'string' },
        }
      )
    );
    assert.deepStrictEqual(attrs(model, 'ApiKey'), ['SECRET']);
    assert.deepStrictEqual(attrs(model, 'ClientSecret'), ['SECRET']);
    assert.deepStrictEqual(attrs(model, 'RefreshToken'), ['SECRET']);
    assert.deepStrictEqual(attrs(model, 'AuthType'), []);
    assert.deepStrictEqual(attrs(model, 'ClientId'), []);
  });

  it('leaves a parameter that authentication never interpolates alone', () => {
    const model = parse({
      version: '1.0',
      name: 'SecretConn',
      baseUrl: 'https://api.example.com',
      authentication: {
        type: 'bearer',
        inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ parameters.Token }}' },
      },
      parameters: {
        Token: { requiredType: 'string' },
        AccountId: { requiredType: 'string' },
      },
      nodes: {
        items: {
          request: { method: 'GET', path: '/accounts/{{ parameters.AccountId }}/items' },
          recordSelector: { recordPath: [] },
          fields: { id: { type: 'string' } },
        },
      },
    });
    assert.deepStrictEqual(attrs(model, 'Token'), ['SECRET']);
    assert.strictEqual(model.parameters.AccountId.attributes, undefined);
  });

  it('does not duplicate SECRET on an explicitly marked parameter and keeps its other attributes', () => {
    const model = parse(
      base(
        {
          type: 'bearer',
          inject: {
            into: 'header',
            name: 'Authorization',
            format: 'Bearer {{ parameters.Token }}',
          },
        },
        {
          Token: {
            requiredType: 'string',
            attributes: ['SECRET', 'HIDE_IN_CONFIG_FORM'],
          },
        }
      )
    );
    assert.deepStrictEqual(attrs(model, 'Token'), ['SECRET', 'HIDE_IN_CONFIG_FORM']);
  });

  it('never mutates the caller-supplied manifest object while marking', () => {
    const manifest = base(
      {
        type: 'bearer',
        inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ parameters.Token }}' },
      },
      { Token: { requiredType: 'string' } }
    );
    const model = new ManifestParser().parse(JSON.stringify(manifest));
    assert.deepStrictEqual(attrs(model, 'Token'), ['SECRET']);
    assert.strictEqual(manifest.parameters.Token.attributes, undefined);
  });

  it('treats an unrecognised authentication key as credential-bearing (fail closed)', () => {
    const model = parse(
      base(
        {
          type: 'bearer',
          signingKey: '{{ parameters.SigningKey }}',
          inject: {
            into: 'header',
            name: 'Authorization',
            format: 'Bearer {{ parameters.Token }}',
          },
        },
        {
          Token: { requiredType: 'string' },
          SigningKey: { requiredType: 'string' },
        }
      )
    );
    assert.deepStrictEqual(attrs(model, 'SigningKey'), ['SECRET']);
  });

  it('reports a credential reference to an undeclared parameter instead of silently dropping it', () => {
    const model = parse(
      base(
        {
          type: 'bearer',
          inject: {
            into: 'header',
            name: 'Authorization',
            format: 'Bearer {{ parameters.Ghost }}',
          },
        },
        {}
      )
    );
    // No descriptor exists to carry the attribute, so the sweep cannot protect
    // it — the caller has to be told rather than left assuming coverage.
    assert.deepStrictEqual(model.undeclaredAuthParameters, ['Ghost']);
  });

  it('reports the parameters it auto-marked and an empty residue for a clean manifest', () => {
    const model = parse(
      base(
        {
          type: 'bearer',
          inject: {
            into: 'header',
            name: 'Authorization',
            format: 'Bearer {{ parameters.Token }}',
          },
        },
        { Token: { requiredType: 'string' } }
      )
    );
    assert.deepStrictEqual(model.autoSecretAuthParameters, ['Token']);
    assert.deepStrictEqual(model.undeclaredAuthParameters, []);
  });

  it('reports nothing to auto-mark for a manifest with no authentication block', () => {
    const model = new ManifestParser().parse(
      JSON.stringify({
        version: '1.0',
        name: 'NoAuth',
        baseUrl: 'https://api.example.com',
        parameters: { AccountId: { requiredType: 'string' } },
        nodes: {
          items: {
            request: { method: 'GET', path: '/items' },
            recordSelector: { recordPath: [] },
            fields: { id: { type: 'string' } },
          },
        },
      })
    );
    assert.deepStrictEqual(model.autoSecretAuthParameters, []);
    assert.deepStrictEqual(model.undeclaredAuthParameters, []);
  });
});

describe('ManifestParser node request secrets', () => {
  const base = (nodes, parameters = {}, extra = {}) => ({
    version: '1.0',
    name: 'RequestConn',
    baseUrl: 'https://api.example.com',
    parameters,
    nodes,
    ...extra,
  });

  const node = request => ({
    request,
    recordSelector: { recordPath: [] },
    fields: { id: { type: 'string' } },
  });

  const parse = manifest => new ManifestParser().parse(JSON.stringify(manifest));
  const attrs = (model, name) => model.parameters[name]?.attributes ?? [];

  // The guard for why this pass REPORTS instead of marking. A node request legitimately
  // interpolates page sizes, dates, account ids and field lists; marking those SECRET
  // would mask ordinary configuration in the UI and push it into the credentials table —
  // a worse bug than the one the report closes. `authentication` is a credential position
  // by definition, which is what makes auto-marking safe there and not here.
  it('neither reports nor marks the ordinary parameters a node request interpolates', () => {
    const model = parse(
      base(
        {
          items: node({
            method: 'GET',
            path: '/accounts/{{ parameters.AccountId }}/items',
            queryParameters: {
              limit: '{{ parameters.PageSize }}',
              since: '{{ parameters.StartDate }}',
            },
          }),
        },
        {
          AccountId: { requiredType: 'string' },
          PageSize: { requiredType: 'string' },
          StartDate: { requiredType: 'string' },
        }
      )
    );
    assert.deepStrictEqual(model.unprotectedRequestParameters, []);
    assert.strictEqual(model.parameters.AccountId.attributes, undefined);
    assert.strictEqual(model.parameters.PageSize.attributes, undefined);
    assert.strictEqual(model.parameters.StartDate.attributes, undefined);
  });

  it('reports a credential-looking request parameter when no authentication block marks it', () => {
    const model = parse(
      base(
        {
          items: node({
            method: 'GET',
            path: '/items',
            queryParameters: { api_key: '{{ parameters.ApiKey }}' },
          }),
        },
        { ApiKey: { requiredType: 'string' } }
      )
    );
    assert.deepStrictEqual(model.unprotectedRequestParameters, [
      { parameter: 'ApiKey', usedIn: ['nodes.items.request.queryParameters.api_key'] },
    ]);
    // Reported, NOT marked: the host warns the author, who stays the one who decides
    // that this parameter is a credential.
    assert.strictEqual(model.parameters.ApiKey.attributes, undefined);
  });

  it('reports a credential-looking parameter interpolated into a literal request header', () => {
    const model = parse(
      base(
        {
          items: node({
            method: 'GET',
            path: '/items',
            headers: { 'X-Auth-Token': 'Bearer {{ parameters.AccessToken }}' },
          }),
        },
        { AccessToken: { requiredType: 'string' } }
      )
    );
    assert.deepStrictEqual(model.unprotectedRequestParameters, [
      { parameter: 'AccessToken', usedIn: ['nodes.items.request.headers.X-Auth-Token'] },
    ]);
  });

  it('reports a credential-looking parameter in a substream parent request', () => {
    const model = parse(
      base(
        {
          items: {
            ...node({ method: 'GET', path: '/items/{{ stream_slice.id }}' }),
            partitionRouter: {
              type: 'substream',
              partitionField: 'id',
              parent: {
                key: 'id',
                request: {
                  method: 'GET',
                  path: '/parents',
                  queryParameters: { token: '{{ parameters.ParentToken }}' },
                },
              },
            },
          },
        },
        { ParentToken: { requiredType: 'string' } }
      )
    );
    assert.deepStrictEqual(model.unprotectedRequestParameters, [
      {
        parameter: 'ParentToken',
        usedIn: ['nodes.items.partitionRouter.parent.request.queryParameters.token'],
      },
    ]);
  });

  it('collects every place one parameter is used into a single report entry', () => {
    const model = parse(
      base(
        {
          items: node({
            method: 'GET',
            path: '/items',
            headers: { Authorization: 'Bearer {{ parameters.ApiKey }}' },
            queryParameters: { api_key: '{{ parameters.ApiKey }}' },
          }),
        },
        { ApiKey: { requiredType: 'string' } }
      )
    );
    assert.deepStrictEqual(model.unprotectedRequestParameters, [
      {
        parameter: 'ApiKey',
        usedIn: [
          'nodes.items.request.headers.Authorization',
          'nodes.items.request.queryParameters.api_key',
        ],
      },
    ]);
  });

  it('stays silent when the author already marked the request parameter SECRET', () => {
    const model = parse(
      base(
        {
          items: node({
            method: 'GET',
            path: '/items',
            queryParameters: { api_key: '{{ parameters.ApiKey }}' },
          }),
        },
        { ApiKey: { requiredType: 'string', attributes: ['SECRET'] } }
      )
    );
    assert.deepStrictEqual(model.unprotectedRequestParameters, []);
  });

  it('stays silent when authentication already auto-marked the parameter the request reuses', () => {
    const model = parse(
      base(
        {
          items: node({
            method: 'GET',
            path: '/items',
            queryParameters: { api_key: '{{ parameters.ApiKey }}' },
          }),
        },
        { ApiKey: { requiredType: 'string' } },
        {
          authentication: {
            type: 'apiKey',
            inject: { into: 'query', name: 'api_key', format: '{{ parameters.ApiKey }}' },
          },
        }
      )
    );
    assert.deepStrictEqual(attrs(model, 'ApiKey'), ['SECRET']);
    assert.deepStrictEqual(model.unprotectedRequestParameters, []);
  });

  it('does not report an undeclared request reference, which never resolves at run time', () => {
    const model = parse(
      base({
        items: node({
          method: 'GET',
          path: '/items',
          queryParameters: { api_key: '{{ parameters.GhostKey }}' },
        }),
      })
    );
    // DeclarativeSource._baseScope exposes only DECLARED parameters, so this placeholder
    // never renders a value — there is no credential to protect and nothing to warn about.
    assert.deepStrictEqual(model.unprotectedRequestParameters, []);
  });
});
