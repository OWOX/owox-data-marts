import assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { AbstractSource } from '../../src/Core/AbstractSource.js';

const fakeContext = {
  emit() {},
  log() {},
  getParameter() {
    return null;
  },
};

class TestSource extends AbstractSource {
  constructor() {
    super(fakeContext);
  }
  async isValidToRetry() {
    return false;
  }
  _delay() {
    return Promise.resolve();
  }
}

function makeTestSource() {
  return new TestSource();
}

// Same stub, but every error is retryable — needed to observe what the SECOND
// attempt targets after a first attempt that took a redirect hop.
class RetryingSource extends TestSource {
  async isValidToRetry() {
    return true;
  }
}

// A token-endpoint POST: the credential lives in the BODY, which a 307 replays.
const TOKEN_POST = {
  method: 'POST',
  headers: {
    Authorization: 'Bearer USER-TOKEN',
    Cookie: 'session=abc',
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: 'grant_type=refresh_token&client_secret=SEKRIT',
};

// A minimal Response-like object with the fields urlFetchWithRetry reads.
function res(status, { location, ok = status >= 200 && status < 300, body = null } = {}) {
  const headers = { get: name => (name.toLowerCase() === 'location' ? (location ?? null) : null) };
  return {
    status,
    statusText: 'S',
    ok,
    headers,
    async text() {
      return body ?? '';
    },
    async json() {
      return body ?? {};
    },
  };
}

describe('AbstractSource.urlFetchWithRetry — manual redirect + per-hop re-validation', () => {
  let originalFetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects a redirect whose Location fails validation (blocked hop)', async () => {
    const src = makeTestSource();
    globalThis.fetch = async () => res(302, { location: 'http://169.254.169.254/' });
    const validate = async u => {
      if (!u.startsWith('https://api.ok/')) throw new Error('blocked hop');
    };
    await assert.rejects(
      () => src.urlFetchWithRetry('https://api.ok/data', { method: 'GET' }, validate),
      /blocked hop/
    );
  });

  it('WITH a validator: passes redirect:"manual" so each hop can be re-validated', async () => {
    const src = makeTestSource();
    let seenOptions;
    globalThis.fetch = async (url, options) => {
      seenOptions = options;
      return res(200, { body: { ok: true } });
    };
    await src.urlFetchWithRetry('https://api.ok/data', { method: 'GET' }, async () => {});
    assert.strictEqual(seenOptions.redirect, 'manual');
  });

  it('WITHOUT a validator: passes redirect:"follow" — delegates redirect handling to undici', async () => {
    const src = makeTestSource();
    let seenOptions;
    let calls = 0;
    globalThis.fetch = async (url, options) => {
      calls++;
      seenOptions = options;
      return res(200, { body: { ok: true } });
    };
    await src.urlFetchWithRetry('https://api.ok/data', { method: 'GET' });
    assert.strictEqual(seenOptions.redirect, 'follow');
    assert.strictEqual(calls, 1); // single pass; undici (not our loop) resolves any hops
  });

  it('follows an allowed redirect, re-validating the resolved Location, and returns the final 200', async () => {
    const src = makeTestSource();
    const validated = [];
    let hop = 0;
    globalThis.fetch = async url => {
      hop++;
      if (hop === 1) return res(302, { location: '/next' }); // relative Location
      assert.strictEqual(url, 'https://api.ok/next'); // resolved against base
      return res(200, { body: { done: true } });
    };
    const validate = async u => {
      validated.push(u);
    };
    const out = await src.urlFetchWithRetry('https://api.ok/data', { method: 'GET' }, validate);
    assert.strictEqual(out.status, 200);
    assert.deepStrictEqual(validated, ['https://api.ok/next']); // the hop was re-validated
  });

  it('throws "too many redirects" past the hop cap (5)', async () => {
    const src = makeTestSource();
    let n = 0;
    globalThis.fetch = async () => {
      n++;
      return res(302, { location: `https://api.ok/h${n}` });
    };
    const validate = async () => {};
    await assert.rejects(
      () => src.urlFetchWithRetry('https://api.ok/start', { method: 'GET' }, validate),
      /too many redirects/i
    );
  });

  it('WITHOUT a validator: does NOT manually loop on a 3xx — undici owns redirect following', async () => {
    // With redirect:'follow', real undici resolves hops transparently and never
    // surfaces a 3xx to us. Our code must NOT run the manual hop loop here: it
    // issues a single fetch with redirect:'follow' and returns its result. (A stub
    // 3xx is surfaced as-is because the stub isn't undici, but the point under test
    // is that we do not loop/re-issue — bundled Sources keep undici's ~20-hop,
    // auto-303→GET behavior instead of our 5-hop manual cap.)
    const src = makeTestSource();
    let n = 0;
    globalThis.fetch = async (url, options) => {
      n++;
      assert.strictEqual(options.redirect, 'follow');
      return res(302, { location: 'https://api.ok/next', ok: true });
    };
    await src.urlFetchWithRetry('https://api.ok/start', { method: 'GET' });
    assert.strictEqual(n, 1, 'must issue exactly one fetch and delegate redirects to undici');
  });

  it('a non-redirect response is returned unchanged (no validator needed)', async () => {
    const src = makeTestSource();
    globalThis.fetch = async () => res(200, { body: { hello: 'world' } });
    const out = await src.urlFetchWithRetry('https://api.ok/data', { method: 'GET' });
    assert.strictEqual(out.status, 200);
    assert.deepStrictEqual(await out.json(), { hello: 'world' });
  });

  it('strips credential-bearing headers and the body on a hop to a DIFFERENT origin', async () => {
    const src = makeTestSource();
    const seen = [];
    globalThis.fetch = async (url, options) => {
      seen.push({ url, options });
      return seen.length === 1
        ? res(307, { location: 'https://other.host/token' })
        : res(200, { body: { ok: true } });
    };
    await src.urlFetchWithRetry('https://api.ok/token', TOKEN_POST, async () => {});

    assert.strictEqual(seen.length, 2);
    const replayed = seen[1].options;
    assert.strictEqual(replayed.headers.Authorization, undefined, 'Authorization must be stripped');
    assert.strictEqual(replayed.headers.Cookie, undefined, 'Cookie must be stripped');
    assert.strictEqual(replayed.body, undefined, 'the credential-bearing body must be dropped');
    assert.ok(
      !JSON.stringify(seen[1]).includes('SEKRIT'),
      `client_secret replayed cross-origin: ${JSON.stringify(seen[1])}`
    );
  });

  it('keeps headers and the body on a SAME-origin hop', async () => {
    const src = makeTestSource();
    const seen = [];
    globalThis.fetch = async (url, options) => {
      seen.push({ url, options });
      return seen.length === 1
        ? res(307, { location: 'https://api.ok/token/v2' })
        : res(200, { body: { ok: true } });
    };
    await src.urlFetchWithRetry('https://api.ok/token', TOKEN_POST, async () => {});

    assert.strictEqual(seen.length, 2);
    assert.strictEqual(seen[1].options.headers.Authorization, 'Bearer USER-TOKEN');
    assert.strictEqual(seen[1].options.body, TOKEN_POST.body);
    assert.strictEqual(seen[1].options.method, 'POST');
  });

  it('downgrades a 303 to GET and drops the body (RFC 9110)', async () => {
    const src = makeTestSource();
    const seen = [];
    globalThis.fetch = async (url, options) => {
      seen.push({ url, options });
      return seen.length === 1
        ? res(303, { location: 'https://api.ok/result' })
        : res(200, { body: { ok: true } });
    };
    await src.urlFetchWithRetry('https://api.ok/token', TOKEN_POST, async () => {});

    assert.strictEqual(seen.length, 2);
    assert.strictEqual(seen[1].options.method, 'GET', '303 must become a GET');
    assert.strictEqual(seen[1].options.body, undefined, '303 must not carry the body');
  });

  it('a retry restarts from the ORIGINAL url, not from the last hop of the failed attempt', async () => {
    const src = new RetryingSource();
    const urls = [];
    globalThis.fetch = async url => {
      urls.push(url);
      return url.endsWith('/start')
        ? res(302, { location: 'https://api.ok/hop' })
        : res(503, { ok: false });
    };

    await assert.rejects(
      () => src.urlFetchWithRetry('https://api.ok/start', { method: 'GET' }, async () => {}),
      /HTTP 503/
    );

    // 3 total attempts (the MaxFetchRetries default), each starting over at
    // /start and taking its own hop — not /start,/hop,/hop,/hop.
    assert.deepStrictEqual(urls, [
      'https://api.ok/start',
      'https://api.ok/hop',
      'https://api.ok/start',
      'https://api.ok/hop',
      'https://api.ok/start',
      'https://api.ok/hop',
    ]);
  });
});
