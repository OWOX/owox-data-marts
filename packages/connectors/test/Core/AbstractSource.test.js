import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { loadGasClass } from '../support/loadGasClass.js';
import { AbstractSource } from '../../src/Core/AbstractSource.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const httpConstantsPath = path.join(__dirname, '../../src/Constants/HttpConstants.js');

// HTTP_STATUS is referenced inside _isAuthError's method body, so it only needs to be
// real by call time, not by load time — but loading the real file (not a hand-stub)
// keeps the test honest against the actual status codes AbstractSource checks.
// AbstractSource itself is an ES module here, so it is imported rather than evaluated.
loadGasClass(httpConstantsPath);
const proto = AbstractSource.prototype;

describe('_isAuthError', () => {
  it.each([
    [401, true],
    [403, true],
    [400, false],
    [500, false],
    [undefined, false],
  ])('statusCode %s -> %s', (statusCode, expected) => {
    expect(proto._isAuthError.call(null, { statusCode })).toBe(expected);
  });
});

// urlFetchWithRetry classifies on the way out, but a source can classify below it with
// far more context — a payload-level permission error carries no status code, so
// recomputing from scratch here would silently clear it and page on-call again.
describe('urlFetchWithRetry warning classification', () => {
  const failWith = async error => {
    globalThis.fetch = async () => {
      throw error;
    };
    const self = Object.assign(Object.create(proto), {
      // A single attempt: the retry check bails immediately, so the throw path runs
      context: {
        getParameter: name => (name === 'MaxFetchRetries' ? { value: 1 } : undefined),
        log: () => {},
        emit: () => {},
      },
    });
    return proto.urlFetchWithRetry.call(self, 'https://example.test', {}).catch(e => e);
  };

  it('keeps a warning flag set by a deeper layer', async () => {
    const thrown = await failWith(
      Object.assign(new Error('No permission to operate advertiser'), { isWarning: true })
    );

    expect(thrown.isWarning).toBe(true);
  });

  it('still promotes an unflagged auth failure to a warning', async () => {
    const thrown = await failWith(Object.assign(new Error('Unauthorized'), { statusCode: 401 }));

    expect(thrown.isWarning).toBe(true);
  });

  it('leaves an ordinary failure unflagged', async () => {
    const thrown = await failWith(Object.assign(new Error('Server error'), { statusCode: 500 }));

    expect(thrown.isWarning).toBe(false);
  });
});

// A provider can answer 200 with a body that is not parseable JSON — valid JSON plus
// trailing bytes, or a stream that dies mid-read. Parsing used to happen in the caller,
// after the retry budget was out of scope, so one corrupted page failed an entire import
// that the next request would have completed. These cover the parse living inside the loop.
describe('urlFetchJsonWithRetry', () => {
  // Stands in for a source like FacebookMarketing, whose isValidToRetry() retries any
  // error without a statusCode. The base class retries nothing, so a retry policy is
  // what makes the loop observable at all.
  const makeSource = (bodies, { retry = true } = {}) => {
    const calls = [];
    globalThis.fetch = async url => {
      const body = bodies[calls.length];
      calls.push(url);
      if (typeof body === 'function') return body();
      return { ok: true, status: 200, statusText: 'OK', text: async () => body };
    };

    const logs = [];
    const self = Object.assign(Object.create(proto), {
      context: {
        getParameter: name => (name === 'MaxFetchRetries' ? { value: 3 } : undefined),
        log: (level, message) => logs.push({ level, message }),
        emit: () => {},
      },
      isValidToRetry: error => retry && !error.statusCode,
      // Real backoff starts at 5s; the policy under test is which errors retry, not how long.
      _delay: () => Promise.resolve(),
    });

    return { self, calls, logs };
  };

  const fetchJson = (source, url = 'https://graph.example.test/v26.0/act_1/ads') =>
    proto.urlFetchJsonWithRetry.call(source.self, url);

  it('retries a body with trailing bytes and returns the next clean page', async () => {
    const source = makeSource(['{"data":[{"id":"1"}]}garbage', '{"data":[{"id":"2"}]}']);

    const parsed = await fetchJson(source);

    expect(parsed).toEqual({ data: [{ id: '2' }] });
    expect(source.calls).toHaveLength(2);
    expect(source.logs.some(entry => /Malformed JSON response/.test(entry.message))).toBe(true);
  });

  it('retries a body read that dies mid-stream', async () => {
    const source = makeSource([
      () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => {
          throw new TypeError('terminated');
        },
      }),
      '{"data":[]}',
    ]);

    await expect(fetchJson(source)).resolves.toEqual({ data: [] });
    expect(source.calls).toHaveLength(2);
  });

  it('gives up after the attempt budget and names the endpoint', async () => {
    const source = makeSource(['{}x', '{}x', '{}x']);

    const thrown = await fetchJson(source).catch(e => e);

    expect(thrown).toBeInstanceOf(SyntaxError);
    expect(thrown.message).toContain('Malformed JSON response from');
    expect(thrown.message).toContain('/v26.0/act_1/ads');
    expect(source.calls).toHaveLength(3);
  });

  it('does not retry when the source policy declines', async () => {
    const source = makeSource(['{}x', '{"data":[]}'], { retry: false });

    await expect(fetchJson(source)).rejects.toThrow('Malformed JSON response from');
    expect(source.calls).toHaveLength(1);
  });

  it('redacts credentials from the endpoint it names', async () => {
    const source = makeSource(['{}x'], { retry: false });

    const thrown = await fetchJson(
      source,
      'https://graph.example.test/v26.0/act_1/ads?access_token=SECRET'
    ).catch(e => e);

    expect(thrown.message).not.toContain('SECRET');
  });

  // The message reports the body's SIZE, never its content. A page's tail is
  // `paging.next`, which carries the access token, and redactSecrets() only
  // replaces a secret matched in full -- so a quoted tail clipped mid-token
  // would leak the fragment into run logs that viewers can read.
  it('reports the body size without quoting the body', async () => {
    const body =
      '{"data":[],"paging":{"next":"https://graph.example.test/n?access_token=TOKENVALUE"}}x';
    const source = makeSource([body], { retry: false });

    const thrown = await fetchJson(source).catch(e => e);

    expect(thrown.message).toContain(`(${body.length} chars)`);
    expect(thrown.message).not.toContain('TOKENVALUE');
    expect(thrown.message).not.toContain('paging');
  });

  // V8's "Unexpected token" family quotes ~10 characters of the body around the fault
  // (and a short body in full), unlike the positional families that quote nothing.
  it('keeps the body out of an Unexpected-token message', async () => {
    const body =
      '{"paging":{"next":"https://graph.example.test/n?access_token=TOKENVALUE"},"x":Z"y"}';
    const source = makeSource([body], { retry: false });

    const thrown = await fetchJson(source).catch(e => e);

    expect(thrown.message).toContain("Unexpected token 'Z'");
    expect(thrown.message).not.toContain('TOKENVALUE');
    expect(thrown.message).not.toContain('LUE"');
    expect(thrown.message).not.toContain('paging');
    expect(thrown.message).not.toContain('is not valid JSON');
  });

  it('names the endpoint when the body read keeps failing', async () => {
    const cutStream = () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => {
        throw new TypeError('terminated');
      },
    });
    const source = makeSource([cutStream, cutStream, cutStream]);

    const thrown = await fetchJson(source).catch(e => e);

    expect(thrown.message).toContain('Failed reading response body from');
    expect(thrown.message).toContain('/v26.0/act_1/ads');
    expect(thrown.message).toContain('terminated');
    expect(source.calls).toHaveLength(3);
  });

  it('leaves urlFetchWithRetry returning an unread response', async () => {
    let reads = 0;
    const source = makeSource([
      () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => {
          if (++reads > 1) throw new Error('body already read');
          return '{"data":[]}';
        },
      }),
    ]);

    const response = await proto.urlFetchWithRetry.call(source.self, 'https://example.test');

    expect(response.ok).toBe(true);
    expect(reads).toBe(0);
    await expect(response.text()).resolves.toBe('{"data":[]}');
  });
});
