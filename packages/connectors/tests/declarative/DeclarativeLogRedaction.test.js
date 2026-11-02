import assert from 'node:assert';
import { describe, it } from 'node:test';
import { Requester } from '../../src/Core/Declarative/Requester.js';
import { SyncRetriever } from '../../src/Core/Declarative/SyncRetriever.js';
import { RecordSelector } from '../../src/Core/Declarative/RecordSelector.js';
import { Paginator } from '../../src/Core/Declarative/Paginator.js';
import { Authenticator } from '../../src/Core/Declarative/Authenticator.js';
import { SsrfGuard } from '../../src/Core/Declarative/SsrfGuard.js';
import { TemplateEngine } from '../../src/Core/Declarative/TemplateEngine.js';
import { DeclarativeSource } from '../../src/Core/Declarative/DeclarativeSource.js';
import { ManifestParser } from '../../src/Core/Declarative/ManifestParser.js';
import { AbstractContext } from '../../src/Core/AbstractContext.js';

// The credential the manifest injects into the QUERY STRING, and that the API
// echoes back inside its own next-page link (Graph-style `paging.next`).
const SECRET = 'EAAG_SECRET_TOKEN_zzz';
const NEXT_PAGE_URL = `https://graph.example.com/v1/me/insights?access_token=${SECRET}&after=CURSOR2`;

const engine = new TemplateEngine();
const stubDns = async host => {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return [{ address: host, family: 4 }];
  return [{ address: '93.184.216.34', family: 4 }];
};
const guardFor = hosts => new SsrfGuard(hosts, { lookup: stubDns });

function capturingContext() {
  const logs = [];
  return { logs, log: (_lvl, msg) => logs.push(msg), emit: () => {} };
}

describe('declarative run logs never echo a credential-bearing URL', () => {
  it('SyncRetriever page-budget notice redacts the upstream next-page URL', async () => {
    const ctx = capturingContext();
    const requester = {
      async send() {
        return { data: [{ a: 1 }], paging: { next: NEXT_PAGE_URL } };
      },
    };
    const retriever = new SyncRetriever({
      requester,
      recordSelector: new RecordSelector({ recordPath: ['data'] }),
      requestSpec: { method: 'GET', path: '/v1/me/insights' },
      paginator: new Paginator({
        type: 'cursor',
        cursor: { from: 'body', path: ['paging', 'next'] },
        inject: { into: 'path' },
      }),
      // 1 page is the default for a builder live-test run, so this notice fires
      // on essentially every test of a link-paginated node.
      maxPages: 1,
      context: ctx,
    });

    await retriever.run({});

    assert.strictEqual(ctx.logs.length, 1, 'expected the page-budget notice');
    assert.ok(!ctx.logs[0].includes(SECRET), `credential leaked into the run log: ${ctx.logs[0]}`);
    // The endpoint is still identifiable for diagnosis.
    assert.ok(ctx.logs[0].includes('https://graph.example.com/v1/me/insights'));
  });

  it('Requester IGNORE notice redacts the upstream next-page URL', async () => {
    const ctx = capturingContext();
    const httpClient = {
      async urlFetchWithRetry() {
        throw Object.assign(new Error('HTTP 500'), { _declAction: 'IGNORE', statusCode: 500 });
      },
    };
    const requester = new Requester({
      baseUrl: 'https://graph.example.com',
      httpClient,
      auth: new Authenticator(
        {
          type: 'apiKey',
          inject: { into: 'query', name: 'access_token', format: '{{ parameters.ApiKey }}' },
        },
        engine
      ),
      ssrfGuard: guardFor(['graph.example.com']),
      templateEngine: engine,
      context: ctx,
      nodeName: 'insights',
    });

    const spec = { method: 'GET', path: '/v1/me/insights' };
    const next = new Paginator({
      type: 'cursor',
      cursor: { from: 'body', path: ['paging', 'next'] },
      inject: { into: 'path' },
    }).next({ response: { paging: { next: NEXT_PAGE_URL } }, request: spec, recordCount: 1 });

    const out = await requester.send(next, { parameters: { ApiKey: SECRET } });
    assert.deepStrictEqual(out, []);

    assert.strictEqual(ctx.logs.length, 1, 'expected the IGNORE notice');
    assert.ok(!ctx.logs[0].includes(SECRET), `credential leaked into the run log: ${ctx.logs[0]}`);
    assert.ok(ctx.logs[0].includes('https://graph.example.com/v1/me/insights'));
  });

  it('SsrfGuard rejection does not echo the query string of an unparsable URL', async () => {
    const guard = guardFor(['graph.example.com']);
    // An async job's `resultUrlPath` value comes straight out of an upstream
    // response body; a relative one does not parse, and it can be a signed link.
    await assert.rejects(
      () => guard.assertPublicHttps(`/download/report?token=${SECRET}`),
      err => {
        assert.ok(!err.message.includes(SECRET), `credential leaked into error: ${err.message}`);
        return true;
      }
    );
    await assert.rejects(
      () => guard.assertAllowed(`/v1/me/insights?access_token=${SECRET}`),
      err => {
        assert.ok(!err.message.includes(SECRET), `credential leaked into error: ${err.message}`);
        return true;
      }
    );
  });
});

// A URL can carry a key in a form whole-value redaction never matches, e.g. spelled out by an API.
describe('a run with key parameters names request URLs by origin only', () => {
  const KEY = 'Qz7Xw9Kv2Bm4';
  const ORIGIN = 'https://api.example.com';
  const KEYED = '{{ parameters.ApiKey }}';
  const RENDERED = [...KEY].join('-');
  // Any three characters of the key or of its spelled-out form, e.g. "Qz7" or "Q-z".
  const pieces = [KEY, RENDERED].flatMap(text =>
    [...text].slice(0, -2).map((_, i) => text.slice(i, i + 3))
  );
  const leaked = line => line.includes('/v1/') || pieces.some(piece => line.includes(piece));

  const manifestWith = (request, authentication) =>
    new ManifestParser().parse(
      JSON.stringify({
        version: '1.0',
        name: 'Keyed',
        baseUrl: ORIGIN,
        authentication: authentication ?? {
          type: 'apiKey',
          inject: { into: 'header', name: 'X-Key', format: '{{ parameters.ApiKey }}' },
        },
        parameters: { ApiKey: { requiredType: 'string' } },
        nodes: {
          items: {
            uniqueKeys: ['id'],
            fields: { id: { type: 'string' } },
            request: { method: 'GET', ...request },
            recordSelector: { recordPath: [] },
          },
        },
      })
    );

  const contextWith = keyParameters =>
    new AbstractContext({
      source: { name: 'Keyed', config: { ApiKey: { value: KEY } } },
      storage: { name: 'MockStorage', config: {} },
      runConfig: { type: 'INCREMENTAL', data: [], state: {} },
      env: { datamartId: 'dm', runId: 'run' },
      keyParameters,
    });

  // Runs one node and returns every line it wrote, its error as the runner reports it.
  async function runNode(model, keyParameters, fetchStub) {
    const context = contextWith(keyParameters);
    const source = new DeclarativeSource(context, model);
    source.ssrfGuard = guardFor(['api.example.com']);
    source._delay = () => Promise.resolve();
    const lines = [];
    const write = process.stdout.write;
    const fetchBefore = globalThis.fetch;
    // Event lines only: the test runner's own output passes through.
    process.stdout.write = (chunk, ...rest) =>
      String(chunk).startsWith('{')
        ? lines.push(String(chunk)) > 0
        : write.call(process.stdout, chunk, ...rest);
    globalThis.fetch = fetchStub;
    try {
      await source.fetchData({ nodeName: 'items', fields: ['id'], accountId: null });
    } catch (error) {
      lines.push(context.redactSecrets(error.message));
    } finally {
      process.stdout.write = write;
      globalThis.fetch = fetchBefore;
    }
    return lines;
  }
  const traceUrls = lines =>
    lines.filter(line => line.includes('"http_request"')).map(line => JSON.parse(line).details.url);
  const redirectForever = async url => ({
    ok: false,
    status: 302,
    statusText: 'Found',
    headers: { get: name => (name.toLowerCase() === 'location' ? url : null) },
  });

  it('keeps no path in the trace or in the error when the path holds a key', async () => {
    const lines = await runNode(
      manifestWith({ path: `/v1/${KEYED}/items` }),
      ['ApiKey'],
      redirectForever
    );

    assert.ok(
      lines.some(line => line.includes('Too many redirects')),
      lines.join('\n')
    );
    assert.deepStrictEqual([...new Set(traceUrls(lines))], [ORIGIN]);
    for (const line of lines) assert.ok(!leaked(line), `key-derived text in: ${line}`);
  });

  it('keeps origin and path in the trace of a run without key parameters', async () => {
    const lines = await runNode(manifestWith({ path: '/v1/items' }), [], async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      async text() {
        return '[]';
      },
      async json() {
        return [];
      },
    }));

    assert.deepStrictEqual(traceUrls(lines), [`${ORIGIN}/v1/items`]);
  });

  it('redacts the token the Authenticator obtained from every line of any run', async () => {
    const TOKEN = 'tok_9f8e7d6c5b4a';
    const model = manifestWith(
      { path: '/v1/{{ auth.token }}/items' },
      {
        type: 'tokenExchange',
        exchange: {
          url: `${ORIGIN}/auth`,
          body: { api_key: '{{ parameters.ApiKey }}' },
          tokenPath: ['token'],
        },
        inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
      }
    );
    const lines = await runNode(model, [], async url =>
      url.endsWith('/auth')
        ? { ok: true, status: 200, json: async () => ({ token: TOKEN }) }
        : {
            ok: false,
            status: 400,
            statusText: 'Bad Request',
            headers: { get: () => null },
            text: async () => JSON.stringify({ message: `token ${TOKEN} is not valid` }),
          }
    );

    assert.ok(traceUrls(lines).includes(`${ORIGIN}/v1/***/items`), lines.join('\n'));
    assert.ok(
      lines.some(line => line.includes('is not valid')),
      lines.join('\n')
    );
    for (const line of lines) assert.ok(!line.includes(TOKEN), `token in: ${line}`);
  });

  const keyRunContext = () => ({ ...capturingContext(), keyParameters: new Set(['ApiKey']) });
  const keyedRequester = (context, httpClient = {}) =>
    new Requester({
      baseUrl: ORIGIN,
      httpClient,
      auth: new Authenticator(null, engine),
      ssrfGuard: guardFor(['api.example.com']),
      templateEngine: engine,
      context,
      nodeName: 'items',
    });

  it('the rendered-path error of a key run names the origin only', async () => {
    const requester = keyedRequester(keyRunContext());
    await assert.rejects(
      () => requester.send({ method: 'GET', path: KEYED }, { parameters: { ApiKey: KEY } }),
      error => {
        assert.match(error.message, /path must start with/);
        assert.ok(error.message.includes(ORIGIN), error.message);
        assert.ok(!leaked(error.message), error.message);
        return true;
      }
    );
  });

  it('the IGNORE notice of a key run names the origin only', async () => {
    const context = keyRunContext();
    const requester = keyedRequester(context, {
      async urlFetchWithRetry() {
        throw Object.assign(new Error('HTTP 500'), { _declAction: 'IGNORE', statusCode: 500 });
      },
    });
    const nextPage = new Paginator({
      type: 'cursor',
      cursor: { from: 'body', path: ['links', 'next'] },
      inject: { into: 'path' },
    }).next({
      response: { links: { next: `/v1/${RENDERED}/items?page=2` } },
      request: { method: 'GET', path: '/v1/items' },
      recordCount: 1,
    });

    await requester.send(nextPage, { parameters: { ApiKey: KEY } });

    assert.strictEqual(context.logs.length, 1, 'expected the IGNORE notice');
    assert.ok(context.logs[0].includes(`(${ORIGIN})`), context.logs[0]);
    assert.ok(!leaked(context.logs[0]), context.logs[0]);
  });

  // Every page links to a next one, a path the API echoed the key-derived request path into.
  const endlessRetriever = (context, maxPages) => {
    let page = 1;
    return new SyncRetriever({
      requester: {
        baseUrl: ORIGIN,
        async send() {
          return { data: [{ a: 1 }], links: { next: `/v1/${RENDERED}/items?page=${++page}` } };
        },
      },
      recordSelector: new RecordSelector({ recordPath: ['data'] }),
      requestSpec: { method: 'GET', path: '/v1/items' },
      paginator: new Paginator({
        type: 'cursor',
        cursor: { from: 'body', path: ['links', 'next'] },
        inject: { into: 'path' },
      }),
      maxPages,
      context,
    });
  };

  it('the page-budget notice of a key run names the origin only', async () => {
    const context = keyRunContext();

    await endlessRetriever(context, 1).run({});

    assert.strictEqual(context.logs.length, 1, 'expected the page-budget notice');
    assert.ok(context.logs[0].includes(`(${ORIGIN})`), context.logs[0]);
    assert.ok(!leaked(context.logs[0]), context.logs[0]);
  });

  it('the unended-pagination error of a key run, with no page cap chosen, names the origin only', async () => {
    await assert.rejects(
      () => endlessRetriever(keyRunContext(), undefined).run({}),
      error => {
        assert.match(error.message, /Pagination did not end/);
        assert.ok(error.message.includes(`(${ORIGIN})`), error.message);
        assert.ok(!leaked(error.message), error.message);
        return true;
      }
    );
  });

  it("a key run's SsrfGuard rejection does not echo the path", async () => {
    const guard = new DeclarativeSource(
      contextWith(['ApiKey']),
      manifestWith({ path: '/v1/items' })
    ).ssrfGuard;
    await assert.rejects(
      () => guard.assertPublicHttps(`/v1/${RENDERED}/report.json`),
      error => {
        assert.match(error.message, /invalid URL/);
        assert.ok(!leaked(error.message), error.message);
        return true;
      }
    );
  });
});
