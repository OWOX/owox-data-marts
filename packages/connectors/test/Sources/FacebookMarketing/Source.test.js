import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it, vi } from 'vitest';
import { loadGasClass } from '../../support/loadGasClass.js';
import { FacebookMarketingSource } from '../../../src/Sources/FacebookMarketing/Source.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const httpConstantsPath = path.join(__dirname, '../../../src/Constants/HttpConstants.js');
const errorCodesPath = path.join(
  __dirname,
  '../../../src/Sources/FacebookMarketing/Constants/ErrorCodes.js'
);

// HTTP_STATUS, FB_RETRYABLE_ERROR_CODES and LOG_LEVEL stay bare globals, the way the built
// bundle supplies them to every source; the source and its base class are ES modules and
// are imported instead.
loadGasClass(httpConstantsPath);
loadGasClass(errorCodesPath);
globalThis.LOG_LEVEL = { INFO: 'info', WARN: 'warn', ERROR: 'error' };
const proto = FacebookMarketingSource.prototype;

const fbError = (code, extra = {}) => ({
  statusCode: 400,
  payload: { error: { code, type: 'OAuthException', ...extra } },
});

// _isAuthError now defers to the retry logic, so `this` must resolve the real
// prototype methods rather than being a bare object.
const stub = Object.assign(Object.create(proto), { context: { log: () => {} } });

describe('_isAuthError', () => {
  // Codes below are taken from real production error payloads.
  it.each([
    ['session expired / app deleted', 190],
    ['missing ads_management or business_management permission', 200],
  ])('flags credential failure: %s (code %i)', (_label, code) => {
    expect(proto._isAuthError.call(stub, fbError(code))).toBe(true);
  });

  // Facebook reuses OAuthException for throttling and outages. Those are listed in
  // FB_RETRYABLE_ERROR_CODES, so exhausting retries on them is a real failure to alert on.
  it.each([
    ['ad-account rate limit', 80004],
    ['temporary service unavailability', 2],
  ])('does not flag retryable condition: %s (code %i)', (_label, code) => {
    expect(proto._isAuthError.call(stub, fbError(code))).toBe(false);
  });

  it('does not flag an OAuthException whose retryable marker is the subcode', () => {
    expect(proto._isAuthError.call(stub, fbError(1, { error_subcode: 1504018 }))).toBe(false);
  });

  // isValidToRetry treats these as retryable, so exhausting the attempts on them is a
  // real failure. Classifying them as warnings would silence the alert instead.
  it('does not flag an OAuthException Facebook marked is_transient', () => {
    expect(proto._isAuthError.call(stub, fbError(1, { is_transient: true }))).toBe(false);
  });

  it('does not flag a 5xx carrying an OAuthException payload', () => {
    const error = { statusCode: 500, payload: { error: { code: 1, type: 'OAuthException' } } };
    expect(proto._isAuthError.call(stub, error)).toBe(false);
  });

  it('does not flag a network-level error with no statusCode', () => {
    const error = { payload: { error: { code: 1, type: 'OAuthException' } } };
    expect(proto._isAuthError.call(stub, error)).toBe(false);
  });

  it('still falls back to the default 401/403 check for non-Facebook-shaped errors', () => {
    expect(proto._isAuthError.call(stub, { statusCode: 401 })).toBe(true);
  });

  it('does not flag a non-OAuth Facebook error (reduce-data, code 1 without type)', () => {
    const error = {
      statusCode: 400,
      payload: {
        error: { code: 1, message: "Please reduce the amount of data you're asking for" },
      },
    };
    expect(proto._isAuthError.call(stub, error)).toBe(false);
  });

  it('does not flag a plain server error', () => {
    expect(proto._isAuthError.call(stub, { statusCode: 500 })).toBe(false);
  });
});

describe('_fetchPaginatedData with onBatch', () => {
  // main saved a catalog page by page (#1130), so a failure on page N keeps pages 1..N-1.
  it('hands each page to onBatch and keeps none', async () => {
    const pages = [
      { data: [{ id: '1' }], paging: { next: 'https://graph.facebook.com/page-2' } },
      { data: [{ id: '2' }] },
    ];
    const source = Object.assign(Object.create(proto), {
      context: { log: () => {} },
      _mapResultToColumns: record => record,
      castRecordFields: (_nodeName, record) => record,
      urlFetchJsonWithRetry: vi.fn(async () => pages.shift()),
    });
    const batches = [];

    const result = await source._fetchPaginatedData(
      'https://graph.facebook.com/page-1',
      'ad-account/ads',
      ['id'],
      async batch => {
        batches.push(batch.map(record => record.id));
      }
    );

    expect(result).toEqual([]);
    expect(batches).toEqual([['1'], ['2']]);
  });

  // The failure this guards: a mid-import page arrived as valid JSON plus trailing bytes,
  // the parse threw outside the retry budget, and an import that had already written 88
  // pages failed outright. Parsing now happens inside urlFetchJsonWithRetry's retry loop,
  // so a transient body costs one extra request instead of the whole run.
  it('survives a page body that is valid JSON plus trailing bytes', async () => {
    const attempts = [];
    const source = Object.assign(Object.create(proto), {
      context: {
        getParameter: name => (name === 'MaxFetchRetries' ? { value: 3 } : undefined),
        log: () => {},
        emit: () => {},
      },
      _mapResultToColumns: record => record,
      castRecordFields: (_nodeName, record) => record,
      _delay: () => Promise.resolve(),
    });
    // One corrupted body, then the real page — the production sequence.
    const bodies = ['{"data":[{"id":"1"}]}garbage', '{"data":[{"id":"1"}]}'];
    globalThis.fetch = async url => {
      attempts.push(url);
      return { ok: true, status: 200, statusText: 'OK', text: async () => bodies.shift() };
    };

    const result = await source._fetchPaginatedData(
      'https://graph.facebook.com/page-1',
      'ad-account/ads',
      ['id']
    );

    expect(result).toEqual([{ id: '1' }]);
    expect(attempts).toHaveLength(2);
  });
});
