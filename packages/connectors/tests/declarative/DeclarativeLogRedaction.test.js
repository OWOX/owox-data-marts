import assert from 'node:assert';
import { describe, it } from 'node:test';
import { Requester } from '../../src/Core/Declarative/Requester.js';
import { SyncRetriever } from '../../src/Core/Declarative/SyncRetriever.js';
import { RecordSelector } from '../../src/Core/Declarative/RecordSelector.js';
import { Paginator } from '../../src/Core/Declarative/Paginator.js';
import { Authenticator } from '../../src/Core/Declarative/Authenticator.js';
import { SsrfGuard } from '../../src/Core/Declarative/SsrfGuard.js';
import { TemplateEngine } from '../../src/Core/Declarative/TemplateEngine.js';

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
