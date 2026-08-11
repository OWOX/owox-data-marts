import assert from 'node:assert';
import { describe, it } from 'node:test';
import { Requester } from '../../src/Core/Declarative/Requester.js';
import { Authenticator } from '../../src/Core/Declarative/Authenticator.js';
import { SsrfGuard } from '../../src/Core/Declarative/SsrfGuard.js';
import { TemplateEngine } from '../../src/Core/Declarative/TemplateEngine.js';
import { opaque } from '../../src/Core/Declarative/opaqueValue.js';

const engine = new TemplateEngine();

// Stub DNS so SsrfGuard never hits the network. Allowlisted test hosts resolve to
// a public IP; literal private IPs are echoed back (and caught by the literal
// check before resolution runs anyway).
const stubDns = async host => {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return [{ address: host, family: 4 }];
  return [{ address: '93.184.216.34', family: 4 }];
};
const guardFor = hosts => new SsrfGuard(hosts, { lookup: stubDns });

function fakeClient(captured) {
  return {
    async urlFetchWithRetry(url, options) {
      captured.url = url;
      captured.options = options;
      return {
        async json() {
          return { rates: { USD: 1.1 } };
        },
      };
    },
  };
}

// Helpers for withHeaders + absolute-url tests
const EXPECTED_BODY = { rates: { USD: 1.1 } };
const baseScope = { parameters: {} };

function fakeClientWithHeaders(captured) {
  return {
    async urlFetchWithRetry(url, options) {
      if (captured) {
        captured.url = url;
        captured.options = options;
      }
      return {
        headers: {
          _map: { 'x-request-id': 'abc123' },
          get(name) {
            return this._map[name.toLowerCase()] ?? null;
          },
        },
        async json() {
          return { rates: { USD: 1.1 } };
        },
      };
    },
  };
}

function makeRequester() {
  return new Requester({
    baseUrl: 'https://api.example.com',
    httpClient: fakeClientWithHeaders({}),
    auth: new Authenticator(null, engine),
    ssrfGuard: guardFor(['api.example.com']),
    templateEngine: engine,
  });
}

describe('Requester', () => {
  it('builds a templated URL with auth in the query and returns parsed JSON', async () => {
    const captured = {};
    const requester = new Requester({
      baseUrl: 'https://api.example.com',
      httpClient: fakeClient(captured),
      auth: new Authenticator(
        {
          type: 'apiKey',
          inject: { into: 'query', name: 'app_id', format: '{{ parameters.AppId }}' },
        },
        engine
      ),
      ssrfGuard: guardFor(['api.example.com']),
      templateEngine: engine,
    });

    const body = await requester.send(
      {
        method: 'GET',
        path: '/historical/{{ dateWindow.start }}.json',
        queryParameters: { base: '{{ parameters.base }}' },
      },
      { parameters: { AppId: 'K', base: 'USD' }, dateWindow: { start: '2026-01-01' } }
    );

    assert.strictEqual(
      captured.url,
      'https://api.example.com/historical/2026-01-01.json?base=USD&app_id=K'
    );
    assert.strictEqual(captured.options.method, 'GET');
    assert.deepStrictEqual(body, { rates: { USD: 1.1 } });
  });

  it('rejects a request whose host is not allowlisted', async () => {
    const requester = new Requester({
      baseUrl: 'https://evil.com',
      httpClient: fakeClient({}),
      auth: new Authenticator(null, engine),
      ssrfGuard: guardFor(['api.example.com']),
      templateEngine: engine,
    });
    await assert.rejects(
      () => requester.send({ method: 'GET', path: '/x' }, {}),
      /host "evil.com" is not allowed/
    );
  });

  it('rejects a rendered path that does not start with "/" (host-change defense)', async () => {
    const requester = new Requester({
      baseUrl: 'https://api.example.com',
      httpClient: fakeClient({}),
      auth: new Authenticator(null, engine),
      ssrfGuard: guardFor(['api.example.com']),
      templateEngine: engine,
    });
    await assert.rejects(
      () =>
        requester.send(
          { method: 'GET', path: '{{ parameters.evil }}' },
          { parameters: { evil: '@evil.com/x' } }
        ),
      /path must start with/
    );
  });

  it('blocks a request to a private IP baseUrl', async () => {
    const requester = new Requester({
      baseUrl: 'https://127.0.0.1',
      httpClient: fakeClient({}),
      auth: new Authenticator(null, engine),
      ssrfGuard: guardFor(['127.0.0.1']),
      templateEngine: engine,
    });
    await assert.rejects(() => requester.send({ method: 'GET', path: '/x' }, {}), /blocked IP/);
  });

  it('sends a JSON body for non-GET and defaults Content-Type', async () => {
    const captured = {};
    const requester = new Requester({
      baseUrl: 'https://api.example.com',
      httpClient: fakeClient(captured),
      auth: new Authenticator(null, engine),
      ssrfGuard: guardFor(['api.example.com']),
      templateEngine: engine,
    });
    await requester.send(
      { method: 'POST', path: '/r', body: { id: '{{ account.id }}', n: 5 } },
      { account: { id: 'A1' } }
    );
    assert.strictEqual(captured.options.method, 'POST');
    assert.strictEqual(captured.options.headers['Content-Type'], 'application/json');
    assert.deepStrictEqual(JSON.parse(captured.options.body), { id: 'A1', n: 5 });
  });

  it('awaits auth.prepare before applying auth (token-based)', async () => {
    const captured = {};
    const tokenClient = {
      async urlFetchWithRetry(url, options) {
        if (url.endsWith('/auth/tokens')) {
          return {
            async json() {
              return { token: 'TKN' };
            },
          };
        }
        captured.url = url;
        captured.options = options;
        return {
          async json() {
            return { ok: true };
          },
        };
      },
    };
    const { Authenticator } = await import('../../src/Core/Declarative/Authenticator.js');
    const auth = new Authenticator(
      {
        type: 'tokenExchange',
        exchange: {
          method: 'POST',
          url: 'https://api.example.com/auth/tokens',
          body: {},
          tokenPath: ['token'],
          ttlSeconds: 3600,
        },
        inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
      },
      engine
    );
    const requester = new Requester({
      baseUrl: 'https://api.example.com',
      httpClient: tokenClient,
      auth,
      ssrfGuard: guardFor(['api.example.com']),
      templateEngine: engine,
    });
    await requester.send({ method: 'GET', path: '/data' }, { parameters: {} });
    assert.strictEqual(captured.options.headers.Authorization, 'Bearer TKN');
  });

  it('returns an empty array when error._declAction is IGNORE', async () => {
    const requester = new Requester({
      baseUrl: 'https://api.example.com',
      httpClient: {
        async urlFetchWithRetry() {
          throw Object.assign(new Error('HTTP 404'), { statusCode: 404, _declAction: 'IGNORE' });
        },
      },
      auth: new Authenticator(null, engine),
      ssrfGuard: guardFor(['api.example.com']),
      templateEngine: engine,
    });
    const body = await requester.send({ method: 'GET', path: '/x' }, {});
    assert.deepStrictEqual(body, []);
  });

  // Swallowing the error is the configured action; swallowing it SILENTLY is the
  // bug. Downstream the empty page stops the paginator, so a mid-run IGNORE
  // truncates the result set with no log, no warning and no rows_extracted
  // analytics (that is only emitted when > 0).
  it('logs an INFO diagnostic naming the status, node and path when IGNORE swallows an error', async () => {
    const logs = [];
    const requester = new Requester({
      baseUrl: 'https://api.example.com',
      httpClient: {
        async urlFetchWithRetry() {
          throw Object.assign(new Error('HTTP 500: Server Error'), {
            statusCode: 500,
            _declAction: 'IGNORE',
          });
        },
      },
      auth: new Authenticator(null, engine),
      ssrfGuard: guardFor(['api.example.com']),
      templateEngine: engine,
      context: { log: (level, message) => logs.push({ level, message }) },
      nodeName: 'events',
    });
    const body = await requester.send({ method: 'GET', path: '/x' }, {});

    assert.deepStrictEqual(body, []);
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].level, 'info');
    assert.ok(logs[0].message.includes('500'), `status missing: ${logs[0].message}`);
    assert.ok(logs[0].message.includes('events'), `node name missing: ${logs[0].message}`);
    assert.ok(logs[0].message.includes('/x'), `path missing: ${logs[0].message}`);
  });

  it('still swallows IGNORE without a context (no logging wired)', async () => {
    const requester = new Requester({
      baseUrl: 'https://api.example.com',
      httpClient: {
        async urlFetchWithRetry() {
          throw Object.assign(new Error('HTTP 500'), { statusCode: 500, _declAction: 'IGNORE' });
        },
      },
      auth: new Authenticator(null, engine),
      ssrfGuard: guardFor(['api.example.com']),
      templateEngine: engine,
    });
    assert.deepStrictEqual(await requester.send({ method: 'GET', path: '/x' }, {}), []);
  });

  it('rethrows when error._declAction is not IGNORE', async () => {
    const requester = new Requester({
      baseUrl: 'https://api.example.com',
      httpClient: {
        async urlFetchWithRetry() {
          throw Object.assign(new Error('HTTP 401'), { statusCode: 401, _declAction: 'FAIL' });
        },
      },
      auth: new Authenticator(null, engine),
      ssrfGuard: guardFor(['api.example.com']),
      templateEngine: engine,
    });
    await assert.rejects(() => requester.send({ method: 'GET', path: '/x' }, {}), /HTTP 401/);
  });

  it('rethrows when there is no errorHandler', async () => {
    const requester = new Requester({
      baseUrl: 'https://api.example.com',
      httpClient: {
        async urlFetchWithRetry() {
          throw Object.assign(new Error('HTTP 500'), { statusCode: 500 });
        },
      },
      auth: new Authenticator(null, engine),
      ssrfGuard: guardFor(['api.example.com']),
      templateEngine: engine,
    });
    await assert.rejects(() => requester.send({ method: 'GET', path: '/x' }, {}), /HTTP 500/);
  });

  it('rethrows when error._declAction is null', async () => {
    const requester = new Requester({
      baseUrl: 'https://api.example.com',
      httpClient: {
        async urlFetchWithRetry() {
          throw Object.assign(new Error('HTTP 403'), { statusCode: 403, _declAction: null });
        },
      },
      auth: new Authenticator(null, engine),
      ssrfGuard: guardFor(['api.example.com']),
      templateEngine: engine,
    });
    await assert.rejects(() => requester.send({ method: 'GET', path: '/x' }, {}), /HTTP 403/);
  });

  it('withHeaders returns { body, headers }; default returns the body', async () => {
    const r = makeRequester();
    const res = await r.send({ method: 'GET', path: '/x' }, baseScope, { withHeaders: true });
    assert.deepStrictEqual(res.body, EXPECTED_BODY); // same body the default path returns
    assert.strictEqual(typeof res.headers.get, 'function'); // a Headers-like object
    const bodyOnly = await r.send({ method: 'GET', path: '/x' }, baseScope);
    assert.deepStrictEqual(bodyOnly, EXPECTED_BODY); // unchanged default
  });

  it('follows an absolute RequestPath url and re-validates it via SsrfGuard', async () => {
    const r = makeRequester(); // ssrfGuard allows only api.example.com
    const onHost = await r.send(
      { method: 'GET', url: 'https://api.example.com/v2/next' },
      baseScope
    );
    assert.deepStrictEqual(onHost, EXPECTED_BODY);
    await assert.rejects(
      () => r.send({ method: 'GET', url: 'https://evil.com/next' }, baseScope),
      /not allowed/
    );
  });

  // A `pagination.inject.into: "path"` next page is a location the upstream chose,
  // and it is marked opaque for exactly that reason. Re-applying the node's static
  // query parameters over it used to overwrite the upstream's own `page=2` with the
  // manifest's `page=1`, so every page re-fetched page 1: an unbounded identical
  // request loop that still ends in COMPLETED.
  it('does not overwrite a query parameter the paginator-injected URL already carries', async () => {
    const captured = {};
    const r = new Requester({
      baseUrl: 'https://api.example.com',
      httpClient: fakeClientWithHeaders(captured),
      auth: new Authenticator(null, engine),
      ssrfGuard: guardFor(['api.example.com']),
      templateEngine: engine,
    });
    await r.send(
      {
        method: 'GET',
        url: opaque('https://api.example.com/items?page=2'),
        queryParameters: { page: '1', limit: '50' },
      },
      baseScope
    );
    const url = new URL(captured.url);
    assert.strictEqual(url.searchParams.get('page'), '2'); // the upstream's page survives
    assert.strictEqual(url.searchParams.get('limit'), '50'); // params it does NOT carry still apply
  });

  it('follows an opaque relative next path verbatim, keeping its own query string', async () => {
    const captured = {};
    const r = new Requester({
      baseUrl: 'https://api.example.com',
      httpClient: fakeClientWithHeaders(captured),
      auth: new Authenticator(null, engine),
      ssrfGuard: guardFor(['api.example.com']),
      templateEngine: engine,
    });
    await r.send(
      {
        method: 'GET',
        path: opaque('/items?cursor=abc'),
        queryParameters: { cursor: 'START', limit: '50' },
      },
      baseScope
    );
    const url = new URL(captured.url);
    assert.strictEqual(url.searchParams.get('cursor'), 'abc');
    assert.strictEqual(url.searchParams.get('limit'), '50');
  });

  // The guard is scoped to paginator-injected (opaque) targets only: a manifest's
  // own request keeps the existing precedence, where queryParameters win.
  it('still lets queryParameters win over a query string in a manifest-authored path', async () => {
    const captured = {};
    const r = new Requester({
      baseUrl: 'https://api.example.com',
      httpClient: fakeClientWithHeaders(captured),
      auth: new Authenticator(null, engine),
      ssrfGuard: guardFor(['api.example.com']),
      templateEngine: engine,
    });
    await r.send(
      { method: 'GET', path: '/items?page=9', queryParameters: { page: '1' } },
      { parameters: {} }
    );
    assert.strictEqual(new URL(captured.url).searchParams.get('page'), '1');
  });

  it('passes a per-hop validator (assertAllowed) to urlFetchWithRetry so redirects re-validate', async () => {
    let capturedValidate;
    const httpClient = {
      async urlFetchWithRetry(url, options, validate) {
        capturedValidate = validate;
        return {
          async json() {
            return { ok: true };
          },
        };
      },
    };
    const requester = new Requester({
      baseUrl: 'https://api.example.com',
      httpClient,
      auth: new Authenticator(null, engine),
      ssrfGuard: guardFor(['api.example.com']),
      templateEngine: engine,
    });
    await requester.send({ method: 'GET', path: '/x' }, { parameters: {} });
    assert.strictEqual(
      typeof capturedValidate,
      'function',
      'Requester must thread a validate callback'
    );
    // The validator enforces the manifest allowlist on a redirect Location:
    await assert.doesNotReject(() => capturedValidate('https://api.example.com/v2/next'));
    await assert.rejects(() => capturedValidate('https://evil.com/next'), /not allowed/);
  });

  it('awaits rateLimiter.acquire() before sending the request', async () => {
    const order = [];
    const rateLimiter = {
      async acquire() {
        order.push('acquire');
      },
    };
    const httpClient = {
      async urlFetchWithRetry() {
        order.push('fetch');
        return {
          async json() {
            return {};
          },
        };
      },
    };
    const requester = new Requester({
      baseUrl: 'https://api.example.com',
      httpClient,
      auth: new Authenticator(null, engine),
      ssrfGuard: guardFor(['api.example.com']),
      templateEngine: engine,
      rateLimiter,
    });
    await requester.send({ method: 'GET', path: '/x' }, { parameters: {} });
    assert.deepStrictEqual(order, ['acquire', 'fetch']);
  });

  it('sends without a rateLimiter (default Unlimited) — no throw, no hang', async () => {
    const captured = {};
    const requester = new Requester({
      baseUrl: 'https://api.example.com',
      httpClient: fakeClient(captured),
      auth: new Authenticator(null, engine),
      ssrfGuard: guardFor(['api.example.com']),
      templateEngine: engine,
    });
    const body = await requester.send({ method: 'GET', path: '/x' }, { parameters: {} });
    assert.deepStrictEqual(body, { rates: { USD: 1.1 } });
  });

  it('drops a query parameter whose optional template is unresolved', async () => {
    const captured = {};
    const requester = new Requester({
      baseUrl: 'https://api.example.com',
      httpClient: fakeClient(captured),
      auth: new Authenticator(null, engine),
      ssrfGuard: guardFor(['api.example.com']),
      templateEngine: engine,
    });

    await requester.send(
      {
        method: 'GET',
        path: '/v2/ad-groups',
        queryParameters: {
          limit: '{{ parameters.Limit }}',
          campaign_id: '{{ parameters.CampaignIds }}',
        },
      },
      { parameters: { Limit: '50' } } // CampaignIds intentionally absent
    );

    const url = new URL(captured.url);
    assert.strictEqual(url.searchParams.get('limit'), '50');
    assert.strictEqual(url.searchParams.has('campaign_id'), false);
  });

  it('does not send a query parameter that resolves to an empty string', async () => {
    const captured = {};
    const requester = new Requester({
      baseUrl: 'https://api.example.com',
      httpClient: fakeClient(captured),
      auth: new Authenticator(null, engine),
      ssrfGuard: guardFor(['api.example.com']),
      templateEngine: engine,
    });

    await requester.send(
      {
        method: 'GET',
        path: '/v2/campaigns',
        queryParameters: { limit: '{{ parameters.Limit }}', status: '{{ parameters.Status }}' },
      },
      { parameters: { Limit: '50', Status: '' } }
    );

    const url = new URL(captured.url);
    assert.strictEqual(url.searchParams.get('limit'), '50');
    assert.strictEqual(url.searchParams.has('status'), false);
  });

  it('does not send a query parameter that is literally null, but keeps a zero', async () => {
    const captured = {};
    const requester = new Requester({
      baseUrl: 'https://api.example.com',
      httpClient: fakeClient(captured),
      auth: new Authenticator(null, engine),
      ssrfGuard: guardFor(['api.example.com']),
      templateEngine: engine,
    });

    await requester.send(
      {
        method: 'GET',
        path: '/v2/campaigns',
        queryParameters: { limit: '50', status: null, offset: 0 },
      },
      { parameters: {} }
    );

    const url = new URL(captured.url);
    assert.strictEqual(url.searchParams.get('limit'), '50');
    assert.strictEqual(url.searchParams.has('status'), false);
    assert.strictEqual(url.searchParams.get('offset'), '0');
  });

  it('does not send headers whose value is absent or empty', async () => {
    const captured = {};
    const requester = new Requester({
      baseUrl: 'https://api.example.com',
      httpClient: fakeClient(captured),
      auth: new Authenticator(null, engine),
      ssrfGuard: guardFor(['api.example.com']),
      templateEngine: engine,
    });

    await requester.send(
      {
        method: 'GET',
        path: '/v2/items',
        headers: {
          'X-Missing': '{{ parameters.NotThere }}',
          'X-Tenant': '{{ parameters.Tenant }}',
          'X-Kept': 'yes',
        },
      },
      { parameters: { Tenant: '' } }
    );

    assert.strictEqual('X-Missing' in captured.options.headers, false);
    assert.strictEqual('X-Tenant' in captured.options.headers, false);
    assert.strictEqual(captured.options.headers['X-Kept'], 'yes');
  });

  it('still throws on an unresolved template in the path', async () => {
    const requester = new Requester({
      baseUrl: 'https://api.example.com',
      httpClient: fakeClient({}),
      auth: new Authenticator(null, engine),
      ssrfGuard: guardFor(['api.example.com']),
      templateEngine: engine,
    });

    await assert.rejects(
      () =>
        requester.send({ method: 'GET', path: '/v2/{{ parameters.Missing }}' }, { parameters: {} }),
      /unresolved/
    );
  });

  it('still throws on an unresolved template in the body', async () => {
    const requester = new Requester({
      baseUrl: 'https://api.example.com',
      httpClient: fakeClient({}),
      auth: new Authenticator(null, engine),
      ssrfGuard: guardFor(['api.example.com']),
      templateEngine: engine,
    });

    await assert.rejects(
      () =>
        requester.send(
          { method: 'POST', path: '/v2/items', body: { tenant: '{{ parameters.Missing }}' } },
          { parameters: {} }
        ),
      /unresolved/
    );
  });
});
