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

/** A `this` whose context answers getParameter from a plain name -> value map. */
const withParams = params => ({
  context: { getParameter: name => (name in params ? { value: params[name] } : undefined) },
});

describe('_getShortLinkDomains', () => {
  const withValue = value =>
    proto._getShortLinkDomains.call(withParams({ ShortLinkDomains: value }));

  it('returns an empty list when the setting is not configured', () => {
    expect(proto._getShortLinkDomains.call(withParams({}))).toEqual([]);
    expect(withValue('')).toEqual([]);
  });

  it('strips ports and trailing dots and ignores entries without a dot', () => {
    expect(withValue('https://short.example:8443/abc, com, localhost, brand.example.')).toEqual([
      'short.example',
      'brand.example',
    ]);
  });

  it('normalizes full URLs, paths, casing, and separators to bare domains', () => {
    expect(withValue('https://Links.Example.com/abc/xyz, short.example; other.example/')).toEqual([
      'links.example.com',
      'short.example',
      'other.example',
    ]);
  });
});

describe('_fetchInsightsData short link workflow', () => {
  const nodeName = 'ad-account/insights-by-link-url-asset';
  const rows = [
    { ad_id: '1', link_url_asset: { id: '2', website_url: 'https://short.example/a/b' } },
  ];

  const buildSource = ({ processShortLinks, shortLinkDomains }) =>
    Object.assign(Object.create(proto), {
      fieldsSchema: { [nodeName]: { breakdowns: ['link_url_asset'], level: 'ad', fields: {} } },
      ...withParams({ ProcessShortLinks: processShortLinks, ShortLinkDomains: shortLinkDomains }),
      _prepareFields: () => [],
      _buildInsightsUrl: () => 'https://graph.example/insights',
      _fetchPaginatedData: vi.fn(async () => rows),
    });

  const params = {
    nodeName,
    accountId: '1',
    fields: ['ad_id', 'link_url_asset'],
    timeRange: '',
    url: '',
  };

  it('passes fetched rows and configured domains to processShortLinks', async () => {
    globalThis.processShortLinks = vi.fn(async data => data);
    const source = buildSource({ processShortLinks: true, shortLinkDomains: 'short.example' });

    await proto._fetchInsightsData.call(source, params);

    expect(globalThis.processShortLinks).toHaveBeenCalledWith(rows, {
      shortLinkField: 'link_url_asset',
      urlFieldName: 'website_url',
      nestedPathHosts: ['short.example'],
    });
  });

  it('skips short link processing when the setting is disabled', async () => {
    globalThis.processShortLinks = vi.fn(async data => data);
    const source = buildSource({ processShortLinks: false, shortLinkDomains: 'short.example' });

    const result = await proto._fetchInsightsData.call(source, params);

    expect(globalThis.processShortLinks).not.toHaveBeenCalled();
    expect(result).toBe(rows);
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
      urlFetchWithRetry: vi.fn(async () => ({ json: async () => pages.shift() })),
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
});
