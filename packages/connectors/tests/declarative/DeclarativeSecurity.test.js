import assert from 'node:assert';
import { describe, it } from 'node:test';
import { DeclarativeSource } from '../../src/Core/Declarative/DeclarativeSource.js';
import { ManifestParser } from '../../src/Core/Declarative/ManifestParser.js';
import { Paginator } from '../../src/Core/Declarative/Paginator.js';
import { Requester } from '../../src/Core/Declarative/Requester.js';
import { Authenticator } from '../../src/Core/Declarative/Authenticator.js';
import { SsrfGuard } from '../../src/Core/Declarative/SsrfGuard.js';
import { TemplateEngine } from '../../src/Core/Declarative/TemplateEngine.js';
import { SyncRetriever } from '../../src/Core/Declarative/SyncRetriever.js';
import { AsyncRetriever } from '../../src/Core/Declarative/AsyncRetriever.js';
import { RecordSelector } from '../../src/Core/Declarative/RecordSelector.js';
import { AbstractContext } from '../../src/Core/AbstractContext.js';

function ctx() {
  return new AbstractContext({
    source: { name: 'X', config: { ApiKey: { value: 'K' } } },
    storage: { name: 'MockStorage', config: {} },
    runConfig: { type: 'INCREMENTAL', data: [], state: {} },
    env: { datamartId: 'dm', runId: 'run' },
  });
}

// A manifest whose body date-injection path tries to pollute the prototype.
const MALICIOUS = JSON.stringify({
  version: '1.0',
  name: 'X',
  baseUrl: 'https://api.example.com',
  authentication: {
    type: 'apiKey',
    inject: { into: 'query', name: 'k', format: '{{ parameters.ApiKey }}' },
  },
  parameters: { ApiKey: { requiredType: 'string' } },
  nodes: {
    n: {
      destinationName: 'n',
      isTimeSeries: true,
      uniqueKeys: ['date'],
      fields: { date: { apiName: 'date', type: 'date' } },
      incremental: {
        strategy: 'range',
        cursorField: 'date',
        request: { into: 'body', startPath: ['__proto__', 'polluted'], format: 'YYYY-MM-DD' },
      },
      request: { method: 'POST', path: '/r', body: {} },
      recordSelector: { recordPath: ['rows'] },
    },
  },
});

// The same attack through the OTHER manifest-supplied deep-set path:
// pagination.inject.path. The value written there is the CURSOR, which a hostile
// upstream chooses, so this pollutes Object.prototype with attacker data.
const POLLUTING_PAGINATION = JSON.stringify({
  version: '1.0',
  name: 'X',
  baseUrl: 'https://api.example.com',
  authentication: {
    type: 'apiKey',
    inject: { into: 'query', name: 'k', format: '{{ parameters.ApiKey }}' },
  },
  parameters: { ApiKey: { requiredType: 'string' } },
  nodes: {
    n: {
      destinationName: 'n',
      isTimeSeries: false,
      uniqueKeys: ['id'],
      fields: { id: { apiName: 'id', type: 'string' } },
      request: { method: 'POST', path: '/r', body: {} },
      recordSelector: { recordPath: ['rows'] },
      pagination: {
        type: 'cursor',
        cursor: { from: 'body', path: ['next'] },
        inject: { into: 'body', path: ['__proto__', 'polluted'] },
      },
    },
  },
});

describe('declarative security: prototype pollution', () => {
  it('rejects a manifest body path that targets __proto__ and does not pollute Object.prototype', async () => {
    const model = new ManifestParser().parse(MALICIOUS);
    const source = new DeclarativeSource(ctx(), model);
    await assert.rejects(
      () =>
        source.fetchData({
          nodeName: 'n',
          fields: ['date'],
          accountId: null,
          startDate: '2026-01-01',
          endDate: '2026-01-02',
        }),
      /unsafe key/
    );
    assert.strictEqual({}.polluted, undefined, 'Object.prototype must not be polluted');
  });

  it('rejects a pagination.inject.path that targets __proto__ and does not pollute Object.prototype', () => {
    const paginator = new Paginator({
      type: 'cursor',
      cursor: { from: 'body', path: ['next'] },
      inject: { into: 'body', path: ['__proto__', 'polluted'] },
    });
    try {
      assert.throws(
        () =>
          paginator.next({ response: { next: 'PWNED' }, request: { body: {} }, recordCount: 5 }),
        /unsafe key/
      );
      assert.strictEqual({}.polluted, undefined, 'Object.prototype must not be polluted');
    } finally {
      // Undo the pollution if the guard is missing, so one failure here cannot
      // cascade into unrelated tests sharing this process.
      delete Object.prototype.polluted;
    }
  });

  it('rejects a pagination.inject.path with an unsafe segment at PARSE time', () => {
    assert.throws(() => new ManifestParser().parse(POLLUTING_PAGINATION), /unsafe key/);
  });
});

// --- Response-derived values must never re-enter the template engine ---------
//
// The template scope holds every SECRET parameter and auth.token. A value the
// UPSTREAM chose (a pagination cursor, an async job id) that is rendered through
// that scope becomes a read primitive over the whole credential set, and the
// resulting request goes to a host the manifest author picked. `_redactUrl`
// strips the query string from the trace, so nothing would survive in the logs
// either.

const SECRET = 'super-secret-client-secret';
const EXFIL_CURSOR = '{{ parameters.ClientSecret }}';

// Stub DNS so SsrfGuard never touches the network (same helper as the other
// declarative suites).
const stubDns = async host => {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return [{ address: host, family: 4 }];
  return [{ address: '93.184.216.34', family: 4 }];
};

function realRequester(httpClient, hosts = ['api.example.com']) {
  const engine = new TemplateEngine();
  return new Requester({
    baseUrl: 'https://api.example.com',
    httpClient,
    auth: new Authenticator(null, engine),
    ssrfGuard: new SsrfGuard(hosts, { lookup: stubDns }),
    templateEngine: engine,
  });
}

/** Captures every outgoing request and replies with page 1 then page 2. */
function pagingClient(captured, pageOne) {
  return {
    async urlFetchWithRetry(url, options) {
      captured.push({ url, options });
      const body = captured.length === 1 ? pageOne : { rows: [{ id: '2' }], paging: {} };
      return {
        async json() {
          return body;
        },
      };
    },
  };
}

/** Every byte we put on the wire for a request — URL, headers and body alike. */
function wireBytes(request) {
  return JSON.stringify(request);
}

async function runTwoPages(paginator, requestSpec, captured, pageOne) {
  const retriever = new SyncRetriever({
    requester: realRequester(pagingClient(captured, pageOne)),
    recordSelector: new RecordSelector({ recordPath: ['rows'] }),
    requestSpec,
    paginator,
  });
  await retriever.run({ parameters: { ClientSecret: SECRET } });
}

describe('declarative security: a response value is never rendered as a template', () => {
  it('a hostile cursor injected into the QUERY cannot exfiltrate a secret parameter', async () => {
    const captured = [];
    await runTwoPages(
      new Paginator({
        type: 'cursor',
        cursor: { from: 'body', path: ['paging', 'next'] },
        inject: { into: 'query', name: 'after' },
      }),
      { method: 'GET', path: '/items' },
      captured,
      { rows: [{ id: '1' }], paging: { next: EXFIL_CURSOR } }
    );

    assert.strictEqual(captured.length, 2, 'the second page must have been requested');
    assert.ok(
      !wireBytes(captured[1]).includes(SECRET),
      `secret leaked into the next request: ${wireBytes(captured[1])}`
    );
    // The cursor is still forwarded — VERBATIM, as data — so paging keeps working.
    assert.strictEqual(new URL(captured[1].url).searchParams.get('after'), EXFIL_CURSOR);
  });

  it('a hostile cursor injected into a HEADER cannot exfiltrate a secret parameter', async () => {
    const captured = [];
    await runTwoPages(
      new Paginator({
        type: 'cursor',
        cursor: { from: 'body', path: ['paging', 'next'] },
        inject: { into: 'header', name: 'X-Cursor' },
      }),
      { method: 'GET', path: '/items' },
      captured,
      { rows: [{ id: '1' }], paging: { next: EXFIL_CURSOR } }
    );

    assert.strictEqual(captured.length, 2);
    assert.ok(
      !wireBytes(captured[1]).includes(SECRET),
      `secret leaked into the next request: ${wireBytes(captured[1])}`
    );
    assert.strictEqual(captured[1].options.headers['X-Cursor'], EXFIL_CURSOR);
  });

  it('a hostile cursor injected into the BODY cannot exfiltrate a secret parameter', async () => {
    const captured = [];
    await runTwoPages(
      new Paginator({
        type: 'cursor',
        cursor: { from: 'body', path: ['paging', 'next'] },
        inject: { into: 'body', path: ['variables', 'after'] },
      }),
      { method: 'POST', path: '/items', body: { query: 'Q', variables: { first: 25 } } },
      captured,
      { rows: [{ id: '1' }], paging: { next: EXFIL_CURSOR } }
    );

    assert.strictEqual(captured.length, 2);
    assert.ok(
      !wireBytes(captured[1]).includes(SECRET),
      `secret leaked into the next request: ${wireBytes(captured[1])}`
    );
    assert.strictEqual(JSON.parse(captured[1].options.body).variables.after, EXFIL_CURSOR);
  });

  it('a hostile cursor injected into the PATH cannot exfiltrate a secret parameter', async () => {
    const captured = [];
    await runTwoPages(
      new Paginator({
        type: 'cursor',
        cursor: { from: 'body', path: ['paging', 'next'] },
        inject: { into: 'path' },
      }),
      { method: 'GET', path: '/items' },
      captured,
      { rows: [{ id: '1' }], paging: { next: '/items?leak={{ parameters.ClientSecret }}' } }
    );

    assert.strictEqual(captured.length, 2);
    assert.ok(
      !wireBytes(captured[1]).includes(SECRET),
      `secret leaked into the next request: ${wireBytes(captured[1])}`
    );
  });

  it('a hostile async job id cannot exfiltrate a secret parameter into the poll request', async () => {
    const captured = [];
    const httpClient = {
      async urlFetchWithRetry(url, options) {
        captured.push({ url, options });
        return {
          async json() {
            if (url.includes('/reports/') && url.includes('/status')) {
              return { status: 'READY', result: 'https://cdn.example/r.json' };
            }
            if (url.startsWith('https://cdn.example/')) return { rows: [{ a: 1 }] };
            return { id: EXFIL_CURSOR };
          },
        };
      },
    };
    const retriever = new AsyncRetriever({
      requester: realRequester(httpClient),
      httpClient,
      ssrfGuard: new SsrfGuard([], { lookup: stubDns }),
      recordSelector: new RecordSelector({ recordPath: ['rows'] }),
      config: {
        submit: { method: 'POST', path: '/reports', body: {}, jobIdPath: ['id'] },
        poll: {
          method: 'GET',
          path: '/reports/{{ job.id }}/status',
          statusPath: ['status'],
          readyValue: 'READY',
          failedValue: 'FAILED',
          resultUrlPath: ['result'],
          backoff: { initialMs: 1, maxMs: 1, maxAttempts: 3 },
        },
        download: { format: 'json', recordPath: ['rows'] },
      },
      sleep: async () => {},
    });

    await retriever.run({ parameters: { ClientSecret: SECRET } });

    const poll = captured.find(r => r.url.includes('/status'));
    assert.ok(poll, 'the job must have been polled');
    assert.ok(
      !wireBytes(poll).includes(SECRET),
      `secret leaked into the poll request: ${wireBytes(poll)}`
    );
  });
});
