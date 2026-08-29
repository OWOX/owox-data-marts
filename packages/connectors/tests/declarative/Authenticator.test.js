import assert from 'node:assert';
import { describe, it } from 'node:test';
import { Authenticator } from '../../src/Core/Declarative/Authenticator.js';
import { TemplateEngine } from '../../src/Core/Declarative/TemplateEngine.js';
import { SsrfGuard } from '../../src/Core/Declarative/SsrfGuard.js';

const engine = new TemplateEngine();

// Stub DNS so SsrfGuard never hits the network. Hosts resolve to a public IP;
// literal private IPs are echoed back (caught by the literal check).
const stubDns = async host => {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return [{ address: host, family: 4 }];
  return [{ address: '93.184.216.34', family: 4 }];
};
const guardFor = hosts => new SsrfGuard(hosts, { lookup: stubDns });

describe('Authenticator', () => {
  it('injects an apiKey into the query', () => {
    const auth = new Authenticator(
      {
        type: 'apiKey',
        inject: { into: 'query', name: 'app_id', format: '{{ parameters.AppId }}' },
      },
      engine
    );
    const req = { query: {}, headers: {} };
    auth.apply(req, { parameters: { AppId: 'KEY123' } });
    assert.strictEqual(req.query.app_id, 'KEY123');
  });

  it('injects a bearer token into a header', () => {
    const auth = new Authenticator(
      {
        type: 'bearer',
        inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ parameters.Token }}' },
      },
      engine
    );
    const req = { query: {}, headers: {} };
    auth.apply(req, { parameters: { Token: 'tok' } });
    assert.strictEqual(req.headers.Authorization, 'Bearer tok');
  });

  it('no-ops when there is no authentication block', () => {
    const auth = new Authenticator(null, engine);
    const req = { query: {}, headers: {} };
    auth.apply(req, {});
    assert.deepStrictEqual(req, { query: {}, headers: {} });
  });

  it('throws for an unsupported auth type', () => {
    const auth = new Authenticator(
      { type: 'unsupportedType', inject: { into: 'header', name: 'X', format: 'x' } },
      engine
    );
    assert.throws(
      () => auth.apply({ headers: {}, query: {} }, {}),
      /unsupported type "unsupportedType"/
    );
  });

  it('throws when inject.name is missing', () => {
    const auth = new Authenticator(
      { type: 'apiKey', inject: { into: 'query', format: 'x' } },
      engine
    );
    assert.throws(() => auth.apply({ headers: {}, query: {} }, {}), /requires inject\.name/);
  });

  it('throws for an invalid inject.into', () => {
    const auth = new Authenticator(
      { type: 'apiKey', inject: { into: 'cookie', name: 'k', format: 'v' } },
      engine
    );
    assert.throws(() => auth.apply({ headers: {}, query: {} }, {}), /inject\.into must be/);
  });

  it('tokenExchange.prepare fetches and caches a bearer token into scope.auth', async () => {
    let calls = 0;
    const httpClient = {
      async urlFetchWithRetry(url, options) {
        calls++;
        assert.strictEqual(url, 'https://api.moloco.cloud/cm/v1/auth/tokens');
        assert.strictEqual(options.method, 'POST');
        assert.deepStrictEqual(JSON.parse(options.body), { api_key: 'SECRET' });
        return {
          async json() {
            return { token: 'TKN' };
          },
        };
      },
    };
    const auth = new Authenticator(
      {
        type: 'tokenExchange',
        exchange: {
          method: 'POST',
          url: 'https://api.moloco.cloud/cm/v1/auth/tokens',
          body: { api_key: '{{ parameters.ApiKey }}' },
          tokenPath: ['token'],
          ttlSeconds: 3600,
        },
        inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
      },
      engine
    );
    const scope = { parameters: { ApiKey: 'SECRET' } };
    await auth.prepare(scope, httpClient);
    assert.strictEqual(scope.auth.token, 'TKN');
    const req = { headers: {}, query: {} };
    auth.apply(req, scope);
    assert.strictEqual(req.headers.Authorization, 'Bearer TKN');

    await auth.prepare(scope, httpClient);
    assert.strictEqual(calls, 1);
  });

  it('prepare is a no-op for apiKey', async () => {
    const auth = new Authenticator(
      { type: 'apiKey', inject: { into: 'query', name: 'k', format: '{{ parameters.AppId }}' } },
      engine
    );
    const scope = { parameters: { AppId: 'X' } };
    await auth.prepare(scope, {
      urlFetchWithRetry() {
        throw new Error('should not fetch');
      },
    });
    assert.deepStrictEqual(scope.auth ?? null, null);
  });

  it('tokenExchange.prepare rejects an exchange.url pointing at a private IP', async () => {
    const auth = new Authenticator(
      {
        type: 'tokenExchange',
        exchange: {
          method: 'POST',
          url: 'https://169.254.169.254/token',
          body: {},
          tokenPath: ['token'],
          ttlSeconds: 3600,
        },
        inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
      },
      engine,
      guardFor([])
    );
    await assert.rejects(
      () =>
        auth.prepare(
          { parameters: {} },
          {
            urlFetchWithRetry() {
              throw new Error('should not fetch');
            },
          }
        ),
      /blocked IP/
    );
  });

  it('tokenExchange.prepare passes a per-hop ALLOWLIST validator to the token fetch', async () => {
    let capturedValidate;
    const httpClient = {
      async urlFetchWithRetry(url, options, validate) {
        capturedValidate = validate;
        return {
          async json() {
            return { token: 'T' };
          },
        };
      },
    };
    const auth = new Authenticator(
      {
        type: 'tokenExchange',
        exchange: {
          method: 'POST',
          url: 'https://auth.example.com/token',
          body: {},
          tokenPath: ['token'],
          ttlSeconds: 3600,
        },
        inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
      },
      engine,
      guardFor(['auth.example.com'])
    );
    await auth.prepare({ parameters: {} }, httpClient);
    assert.strictEqual(
      typeof capturedValidate,
      'function',
      'Authenticator must thread a validate callback'
    );
    await assert.rejects(() => capturedValidate('https://169.254.169.254/r'), /blocked IP/);
    // The token request carries the client secret in its BODY, and a 307 replays
    // method + body verbatim. A public host that the manifest never declared is
    // therefore not an acceptable hop target, however "public" it is.
    await assert.doesNotReject(() => capturedValidate('https://auth.example.com/token/v2'));
    await assert.rejects(() => capturedValidate('https://evil.example.com/collect'), /not allowed/);
  });

  it('basic auth sets an Authorization: Basic header from username and password', () => {
    const auth = new Authenticator(
      { type: 'basic', username: '{{ parameters.User }}', password: '{{ parameters.Pass }}' },
      engine
    );
    const req = { query: {}, headers: {} };
    auth.apply(req, { parameters: { User: 'alice', Pass: 's3cret' } });
    const expected = 'Basic ' + Buffer.from('alice:s3cret', 'utf-8').toString('base64');
    assert.strictEqual(req.headers.Authorization, expected);
  });

  it('basic auth supports an empty password (username-only)', () => {
    const auth = new Authenticator({ type: 'basic', username: 'sk_live_x' }, engine);
    const req = { query: {}, headers: {} };
    auth.apply(req, {});
    const expected = 'Basic ' + Buffer.from('sk_live_x:', 'utf-8').toString('base64');
    assert.strictEqual(req.headers.Authorization, expected);
  });

  it('basic auth throws when username is missing', () => {
    const auth = new Authenticator({ type: 'basic', password: 'x' }, engine);
    assert.throws(() => auth.apply({ query: {}, headers: {} }, {}), /"basic" requires username/);
  });

  it('basic auth prepare is a no-op (no token fetch)', async () => {
    const auth = new Authenticator({ type: 'basic', username: 'u', password: 'p' }, engine);
    const scope = {};
    await auth.prepare(scope, {
      urlFetchWithRetry() {
        throw new Error('should not fetch');
      },
    });
    assert.deepStrictEqual(scope.auth ?? null, null);
  });

  it('selective delegates apply to the branch chosen by the parameter', () => {
    const cfg = {
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
    };
    const apiReq = { query: {}, headers: {} };
    new Authenticator(cfg, engine).apply(apiReq, {
      parameters: { AuthMethod: 'apikey', ApiKey: 'K1' },
    });
    assert.strictEqual(apiReq.query.key, 'K1');

    const basicReq = { query: {}, headers: {} };
    new Authenticator(cfg, engine).apply(basicReq, {
      parameters: { AuthMethod: 'basic', User: 'u', Pass: 'p' },
    });
    assert.strictEqual(
      basicReq.headers.Authorization,
      `Basic ${Buffer.from('u:p', 'utf-8').toString('base64')}`
    );
  });

  it('selective throws when the selection value is unset or unknown', () => {
    const cfg = {
      type: 'selective',
      selectionParameter: 'AuthMethod',
      authenticators: {
        apikey: { type: 'apiKey', inject: { into: 'query', name: 'key', format: 'x' } },
      },
    };
    const auth = new Authenticator(cfg, engine);
    assert.throws(
      () => auth.apply({ query: {}, headers: {} }, { parameters: {} }),
      /no authenticator for/
    );
    assert.throws(
      () => auth.apply({ query: {}, headers: {} }, { parameters: { AuthMethod: 'nope' } }),
      /no authenticator for/
    );
  });

  it('selective runs a tokenExchange branch prepare and caches the token across applies', async () => {
    let calls = 0;
    const httpClient = {
      async urlFetchWithRetry() {
        calls += 1;
        return {
          async json() {
            return { access_token: 'T9' };
          },
        };
      },
    };
    const cfg = {
      type: 'selective',
      selectionParameter: 'AuthMethod',
      authenticators: {
        oauth: {
          type: 'tokenExchange',
          exchange: {
            url: 'https://auth.example.com/token',
            method: 'POST',
            body: {},
            tokenPath: ['access_token'],
            ttlSeconds: 3600,
          },
          inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
        },
      },
    };
    const auth = new Authenticator(cfg, engine, guardFor(['auth.example.com']));
    const scope1 = { parameters: { AuthMethod: 'oauth' } };
    await auth.prepare(scope1, httpClient);
    const req1 = { query: {}, headers: {} };
    auth.apply(req1, scope1);
    assert.strictEqual(req1.headers.Authorization, 'Bearer T9');
    const scope2 = { parameters: { AuthMethod: 'oauth' } };
    await auth.prepare(scope2, httpClient); // cached, no second token fetch
    assert.strictEqual(calls, 1);
  });
});

describe('Authenticator oauth2', () => {
  const oauthConfig = (over = {}) => ({
    type: 'oauth2',
    tokenUrl: 'https://oauth.example.com/token',
    clientId: '{{ parameters.ClientId }}',
    clientSecret: '{{ parameters.ClientSecret }}',
    refreshToken: '{{ parameters.RefreshToken }}',
    inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
    ...over,
  });

  const clientFor = handler => ({ urlFetchWithRetry: handler });
  const okJson = body => ({ json: async () => body });

  it('passes a per-hop ALLOWLIST validator, so a redirect cannot replay client_secret to another host', async () => {
    let capturedValidate;
    const client = clientFor(async (url, options, validate) => {
      capturedValidate = validate;
      return okJson({ access_token: 'AT1', expires_in: 3600 });
    });
    const auth = new Authenticator(oauthConfig(), engine, guardFor(['oauth.example.com']), {});
    await auth.prepare(
      { parameters: { ClientId: 'cid', ClientSecret: 'sec', RefreshToken: 'rt0' } },
      client,
      () => 1000
    );

    assert.strictEqual(typeof capturedValidate, 'function');
    await assert.doesNotReject(() => capturedValidate('https://oauth.example.com/token/v2'));
    await assert.rejects(() => capturedValidate('https://evil.example.com/collect'), /not allowed/);
  });

  it('posts a form-urlencoded refresh_token grant and injects the access token', async () => {
    let seen;
    const client = clientFor(async (url, options) => {
      seen = { url, options };
      return okJson({ access_token: 'AT1', expires_in: 3600 });
    });
    const auth = new Authenticator(oauthConfig(), engine, guardFor(['oauth.example.com']), {});
    const scope = { parameters: { ClientId: 'cid', ClientSecret: 'sec', RefreshToken: 'rt0' } };

    await auth.prepare(scope, client, () => 1000);

    assert.strictEqual(seen.url, 'https://oauth.example.com/token');
    assert.strictEqual(seen.options.headers['Content-Type'], 'application/x-www-form-urlencoded');
    const parsed = new URLSearchParams(seen.options.body);
    assert.strictEqual(parsed.get('grant_type'), 'refresh_token');
    assert.strictEqual(parsed.get('client_id'), 'cid');
    assert.strictEqual(parsed.get('client_secret'), 'sec');
    assert.strictEqual(parsed.get('refresh_token'), 'rt0');
    assert.strictEqual(scope.auth.token, 'AT1');

    const req = { query: {}, headers: {} };
    auth.apply(req, scope);
    assert.strictEqual(req.headers.Authorization, 'Bearer AT1');
  });

  it('caches the token for expires_in minus a 60s skew', async () => {
    let calls = 0;
    const client = clientFor(async () => {
      calls++;
      return okJson({ access_token: 'AT', expires_in: 3600 });
    });
    const auth = new Authenticator(oauthConfig(), engine, guardFor(['oauth.example.com']), {});
    const scope = { parameters: { ClientId: 'c', ClientSecret: 's', RefreshToken: 'r' } };

    await auth.prepare(scope, client, () => 0);
    await auth.prepare(scope, client, () => 3_539_000); // just inside 3600-60 s
    assert.strictEqual(calls, 1);
    await auth.prepare(scope, client, () => 3_540_001); // past the skewed expiry
    assert.strictEqual(calls, 2);
  });

  it('caches the token using config.ttlSeconds when the response omits expires_in', async () => {
    let calls = 0;
    // No expires_in on the token response — a spec-legal, if unhelpful, provider.
    const client = clientFor(async () => {
      calls++;
      return okJson({ access_token: 'AT' });
    });
    const auth = new Authenticator(
      oauthConfig({ ttlSeconds: 120 }),
      engine,
      guardFor(['oauth.example.com']),
      {}
    );
    const scope = { parameters: { ClientId: 'c', ClientSecret: 's', RefreshToken: 'r' } };

    await auth.prepare(scope, client, () => 0);
    await auth.prepare(scope, client, () => 119_000); // just inside the configured 120s TTL
    assert.strictEqual(calls, 1);
    await auth.prepare(scope, client, () => 120_001); // past the configured TTL
    assert.strictEqual(calls, 2);
  });

  it('falls back to a 300s default TTL when the response has no expires_in and no ttlSeconds is configured', async () => {
    let calls = 0;
    const client = clientFor(async () => {
      calls++;
      return okJson({ access_token: 'AT' });
    });
    const auth = new Authenticator(oauthConfig(), engine, guardFor(['oauth.example.com']), {});
    const scope = { parameters: { ClientId: 'c', ClientSecret: 's', RefreshToken: 'r' } };

    await auth.prepare(scope, client, () => 0);
    await auth.prepare(scope, client, () => 299_000); // just inside the 300s default
    assert.strictEqual(calls, 1);
    await auth.prepare(scope, client, () => 300_001); // past the 300s default
    assert.strictEqual(calls, 2);
  });

  it('emits a rotated refresh token and reuses it for the rest of the run', async () => {
    const rotated = [];
    const sent = [];
    const client = clientFor(async (url, options) => {
      sent.push(new URLSearchParams(options.body).get('refresh_token'));
      // expires_in omitted, so caching falls back to the 300s default — the
      // second prepare() below runs past that window to force the re-fetch
      // that exercises the second rotation.
      return okJson({ access_token: 'AT', refresh_token: `rt${sent.length}` });
    });
    const auth = new Authenticator(oauthConfig(), engine, guardFor(['oauth.example.com']), {
      onCredentialsUpdate: creds => rotated.push(creds),
    });
    const scope = { parameters: { ClientId: 'c', ClientSecret: 's', RefreshToken: 'rt0' } };

    await auth.prepare(scope, client, () => 0);
    await auth.prepare(scope, client, () => 300_001); // past the 300s default cache window

    assert.deepStrictEqual(sent, ['rt0', 'rt1']); // second call reuses the rotated token
    assert.deepStrictEqual(rotated, [
      { generated_refresh_token: 'rt1' },
      { generated_refresh_token: 'rt2' },
    ]);
  });

  it('prefers the host-persisted GeneratedRefreshToken and falls back to the original on invalid_grant', async () => {
    const sent = [];
    const client = clientFor(async (url, options) => {
      const rt = new URLSearchParams(options.body).get('refresh_token');
      sent.push(rt);
      if (rt === 'stale') {
        throw Object.assign(new Error('HTTP 400: Bad Request'), {
          statusCode: 400,
          payload: { error: 'invalid_grant', error_description: 'expired' },
        });
      }
      return okJson({ access_token: 'AT-original', expires_in: 3600 });
    });
    const auth = new Authenticator(oauthConfig(), engine, guardFor(['oauth.example.com']), {});
    const scope = {
      parameters: {
        ClientId: 'c',
        ClientSecret: 's',
        RefreshToken: 'orig',
        GeneratedRefreshToken: 'stale',
      },
    };

    await auth.prepare(scope, client, () => 0);

    assert.deepStrictEqual(sent, ['stale', 'orig']);
    assert.strictEqual(scope.auth.token, 'AT-original');
  });

  it('does not fall back on a non-invalid_grant error', async () => {
    let calls = 0;
    const client = clientFor(async () => {
      calls++;
      throw Object.assign(new Error('HTTP 500: Server Error'), { statusCode: 500 });
    });
    const auth = new Authenticator(oauthConfig(), engine, guardFor(['oauth.example.com']), {});
    const scope = {
      parameters: {
        ClientId: 'c',
        ClientSecret: 's',
        RefreshToken: 'orig',
        GeneratedRefreshToken: 'gen',
      },
    };

    await assert.rejects(() => auth.prepare(scope, client, () => 0), /HTTP 500/);
    assert.strictEqual(calls, 1);
  });

  it('throws a descriptive error when the token body carries an OAuth error', async () => {
    const client = clientFor(async () =>
      okJson({ error: 'invalid_client', error_description: 'bad secret' })
    );
    const auth = new Authenticator(oauthConfig(), engine, guardFor(['oauth.example.com']), {});
    const scope = { parameters: { ClientId: 'c', ClientSecret: 's', RefreshToken: 'r' } };

    await assert.rejects(
      () => auth.prepare(scope, client, () => 0),
      /Token error: invalid_client - bad secret/
    );
  });

  it('throws when the token response has no access_token', async () => {
    const client = clientFor(async () => okJson({ expires_in: 60 }));
    const auth = new Authenticator(oauthConfig(), engine, guardFor(['oauth.example.com']), {});
    const scope = { parameters: { ClientId: 'c', ClientSecret: 's', RefreshToken: 'r' } };

    await assert.rejects(() => auth.prepare(scope, client, () => 0), /access_token/);
  });

  it('sends no refresh_token for the client_credentials grant', async () => {
    let body;
    const client = clientFor(async (url, options) => {
      body = new URLSearchParams(options.body);
      return okJson({ access_token: 'AT', expires_in: 3600 });
    });
    const auth = new Authenticator(
      oauthConfig({ grantType: 'client_credentials', scope: 'read:all' }),
      engine,
      guardFor(['oauth.example.com']),
      {}
    );
    await auth.prepare(
      { parameters: { ClientId: 'c', ClientSecret: 's', RefreshToken: 'ignored' } },
      client,
      () => 0
    );

    assert.strictEqual(body.get('grant_type'), 'client_credentials');
    assert.strictEqual(body.get('refresh_token'), null);
    assert.strictEqual(body.get('scope'), 'read:all');
  });

  it('rejects an oauth2 config without a tokenUrl', async () => {
    const auth = new Authenticator(oauthConfig({ tokenUrl: undefined }), engine, null, {});
    await assert.rejects(
      () =>
        auth.prepare(
          { parameters: {} },
          clientFor(async () => okJson({})),
          () => 0
        ),
      /tokenUrl/
    );
  });
});

/**
 * A shared token cache must be keyed by the RENDERED token request, never by
 * anything coarser. These tests pin both halves of that: a token is reused when
 * (and only when) the request that produced it was identical, and an
 * account-templated token request can never serve account A's token to account B.
 */
describe('Authenticator shared token cache', () => {
  const clientFor = handler => ({ urlFetchWithRetry: handler });
  const okJson = body => ({ json: async () => body });

  // Per-account credentials, the shape a manifest uses when one connector run
  // fans out over several accounts that each hold their own OAuth grant.
  const perAccountOAuth = () => ({
    type: 'oauth2',
    tokenUrl: 'https://oauth.example.com/token',
    clientId: '{{ parameters.ClientId }}',
    clientSecret: '{{ parameters.ClientSecret }}',
    refreshToken: '{{ account.id }}-refresh',
    inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
  });

  const scopeFor = accountId => ({
    parameters: { ClientId: 'c', ClientSecret: 's' },
    account: { id: accountId },
  });

  it('never serves one account a token minted for another account', async () => {
    const sent = [];
    const client = clientFor(async (url, options) => {
      const rt = new URLSearchParams(options.body).get('refresh_token');
      sent.push(rt);
      return okJson({ access_token: `AT-for-${rt}`, expires_in: 3600 });
    });
    // One cache, deliberately shared by two Authenticators the way
    // DeclarativeSource shares one across every fetchData of a run.
    const cache = new Map();
    const mk = () =>
      new Authenticator(perAccountOAuth(), engine, guardFor(['oauth.example.com']), {
        tokenCache: cache,
      });

    const scopeA = scopeFor('acct-A');
    const scopeB = scopeFor('acct-B');
    await mk().prepare(scopeA, client, () => 0);
    await mk().prepare(scopeB, client, () => 0);

    assert.strictEqual(scopeA.auth.token, 'AT-for-acct-A-refresh');
    assert.strictEqual(scopeB.auth.token, 'AT-for-acct-B-refresh');
    assert.notStrictEqual(scopeA.auth.token, scopeB.auth.token);
    assert.deepStrictEqual(sent, ['acct-A-refresh', 'acct-B-refresh']);
  });

  it('keeps accounts apart under interleaved re-prepares, and each still caches', async () => {
    const sent = [];
    const client = clientFor(async (url, options) => {
      const rt = new URLSearchParams(options.body).get('refresh_token');
      sent.push(rt);
      return okJson({ access_token: `AT-for-${rt}`, expires_in: 3600 });
    });
    const cache = new Map();
    const mk = () =>
      new Authenticator(perAccountOAuth(), engine, guardFor(['oauth.example.com']), {
        tokenCache: cache,
      });

    for (const id of ['acct-A', 'acct-B', 'acct-A', 'acct-B', 'acct-A']) {
      const scope = scopeFor(id);
      await mk().prepare(scope, client, () => 0);
      assert.strictEqual(scope.auth.token, `AT-for-${id}-refresh`);
    }
    // Two accounts, two token endpoint calls — not five.
    assert.deepStrictEqual(sent, ['acct-A-refresh', 'acct-B-refresh']);
  });

  it('reuses one account token across separate Authenticator instances (the #31 fix)', async () => {
    let calls = 0;
    const client = clientFor(async () => {
      calls++;
      return okJson({ access_token: 'AT', expires_in: 3600 });
    });
    const cache = new Map();
    const cfg = {
      type: 'oauth2',
      tokenUrl: 'https://oauth.example.com/token',
      clientId: '{{ parameters.ClientId }}',
      clientSecret: '{{ parameters.ClientSecret }}',
      refreshToken: '{{ parameters.RefreshToken }}',
      inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
    };
    // 24 fetchData calls (2 nodes x 12 date slices), each building its own
    // Authenticator exactly as DeclarativeSource.fetchData does.
    for (let i = 0; i < 24; i++) {
      const auth = new Authenticator(cfg, engine, guardFor(['oauth.example.com']), {
        tokenCache: cache,
      });
      const scope = {
        parameters: { ClientId: 'c', ClientSecret: 's', RefreshToken: 'r' },
        account: { id: 'acct-1' },
        dateWindow: { start: `2026-01-${String(i + 1).padStart(2, '0')}`, end: '2026-01-31' },
      };
      await auth.prepare(scope, client, () => i * 1000);
      assert.strictEqual(scope.auth.token, 'AT');
    }
    assert.strictEqual(calls, 1);
  });

  it('re-mints per date window when the token request templates dateWindow', async () => {
    const sent = [];
    const client = clientFor(async (url, options) => {
      const s = new URLSearchParams(options.body).get('scope');
      sent.push(s);
      return okJson({ access_token: `AT-${s}`, expires_in: 3600 });
    });
    const cache = new Map();
    const cfg = {
      type: 'oauth2',
      grantType: 'client_credentials',
      tokenUrl: 'https://oauth.example.com/token',
      clientId: 'c',
      clientSecret: 's',
      scope: 'reports:{{ dateWindow.start }}',
      inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
    };
    for (const start of ['2026-01-01', '2026-01-02', '2026-01-01']) {
      const auth = new Authenticator(cfg, engine, guardFor(['oauth.example.com']), {
        tokenCache: cache,
      });
      const scope = { parameters: {}, dateWindow: { start, end: start } };
      await auth.prepare(scope, client, () => 0);
      assert.strictEqual(scope.auth.token, `AT-reports:${start}`);
    }
    assert.deepStrictEqual(sent, ['reports:2026-01-01', 'reports:2026-01-02']);
  });

  it('tokenExchange keys on the rendered exchange body, so accounts never share', async () => {
    const sent = [];
    const client = {
      urlFetchWithRetry: async (url, options) => {
        const body = JSON.parse(options.body);
        sent.push(body.account);
        return okJson({ access_token: `T-${body.account}` });
      },
    };
    const cache = new Map();
    const cfg = {
      type: 'tokenExchange',
      exchange: {
        url: 'https://auth.example.com/token',
        method: 'POST',
        body: { account: '{{ account.id }}' },
        tokenPath: ['access_token'],
        ttlSeconds: 3600,
      },
      inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
    };
    const mk = () =>
      new Authenticator(cfg, engine, guardFor(['auth.example.com']), { tokenCache: cache });

    for (const id of ['A', 'B', 'A', 'B']) {
      const scope = { parameters: {}, account: { id } };
      await mk().prepare(scope, client, () => 0);
      assert.strictEqual(scope.auth.token, `T-${id}`);
    }
    assert.deepStrictEqual(sent, ['A', 'B']);
  });

  it('falls back to a private cache when the host supplies none (bundled/test callers)', async () => {
    let calls = 0;
    const client = clientFor(async () => {
      calls++;
      return okJson({ access_token: 'AT', expires_in: 3600 });
    });
    const cfg = {
      type: 'oauth2',
      tokenUrl: 'https://oauth.example.com/token',
      clientId: 'c',
      clientSecret: 's',
      refreshToken: 'r',
      inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
    };
    const guard = guardFor(['oauth.example.com']);
    const scope = { parameters: {} };
    const a1 = new Authenticator(cfg, engine, guard, {});
    await a1.prepare(scope, client, () => 0);
    await a1.prepare(scope, client, () => 0);
    assert.strictEqual(calls, 1); // same instance still caches
    const a2 = new Authenticator(cfg, engine, guard, {});
    await a2.prepare(scope, client, () => 0);
    assert.strictEqual(calls, 2); // a separate instance shares nothing
  });
});
