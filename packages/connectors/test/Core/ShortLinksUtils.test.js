import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadGasClass } from '../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadGasClass(path.join(__dirname, '../../src/Core/Utils/ShortLinksUtils.js'));

const CONFIG = { shortLinkField: 'link_url_asset', urlFieldName: 'website_url' };
const LANDING = 'https://example.com/landing-page';

const redirectTo = location => ({ getResponseCode: () => 302, getHeaders: () => ({ location }) });
const finalPage = () => ({ getResponseCode: () => 200, getHeaders: () => ({}) });

function buildData(websiteUrl) {
  return [{ link_url_asset: { id: '100000000000001', website_url: websiteUrl } }];
}

/** Mocks a server that redirects the first request to LANDING and then answers 200. */
function mockSingleRedirect() {
  globalThis.HttpUtils = {
    fetch: vi.fn(async url => (url === LANDING ? finalPage() : redirectTo(LANDING))),
  };
}

describe('processShortLinks', () => {
  beforeEach(() => {
    mockSingleRedirect();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('resolves nested-path short links on a configured host', async () => {
    const data = buildData('https://short.example/abc/xyz');

    const result = await globalThis.processShortLinks(data, {
      ...CONFIG,
      nestedPathHosts: ['short.example'],
    });

    expect(globalThis.HttpUtils.fetch).toHaveBeenCalledWith(
      'https://short.example/abc/xyz',
      expect.objectContaining({ method: 'GET', redirect: 'manual' })
    );
    expect(result[0].link_url_asset).toEqual({
      id: '100000000000001',
      website_url: 'https://short.example/abc/xyz',
      parsed_url: LANDING,
    });
  });

  it('matches subdomains of a configured host', async () => {
    const data = buildData('https://brand.short.example/abc/xyz');

    await globalThis.processShortLinks(data, { ...CONFIG, nestedPathHosts: ['short.example'] });

    expect(globalThis.HttpUtils.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not treat nested paths on unconfigured hosts as short links', async () => {
    const data = buildData('https://example.com/products/summer-sale');

    const result = await globalThis.processShortLinks(data, {
      ...CONFIG,
      nestedPathHosts: ['short.example'],
    });

    expect(globalThis.HttpUtils.fetch).not.toHaveBeenCalled();
    expect(result).toBe(data);
  });

  it('does not treat nested paths as short links when no hosts are configured', async () => {
    const data = buildData('https://short.example/abc/xyz');

    const result = await globalThis.processShortLinks(data, CONFIG);

    expect(globalThis.HttpUtils.fetch).not.toHaveBeenCalled();
    expect(result).toBe(data);
  });

  it('keeps resolving one-segment short links on any host', async () => {
    const data = buildData('https://short.example/abc123');

    const result = await globalThis.processShortLinks(data, CONFIG);

    expect(result[0].link_url_asset.parsed_url).toBe(LANDING);
  });

  it('keeps rejecting single-segment URLs with a trailing slash', async () => {
    const data = buildData('https://brand.example/shop/');

    const result = await globalThis.processShortLinks(data, CONFIG);

    expect(globalThis.HttpUtils.fetch).not.toHaveBeenCalled();
    expect(result).toBe(data);
  });

  it('keeps rejecting links with UTM tags in the fragment', async () => {
    const data = buildData('https://brand.example/landing#utm_source=facebook&utm_medium=cpc');

    const result = await globalThis.processShortLinks(data, CONFIG);

    expect(globalThis.HttpUtils.fetch).not.toHaveBeenCalled();
    expect(result).toBe(data);
  });

  it('accepts one trailing slash on a configured host', async () => {
    const data = buildData('https://go.brand.example/summer/');

    const result = await globalThis.processShortLinks(data, {
      ...CONFIG,
      nestedPathHosts: ['go.brand.example'],
    });

    expect(result[0].link_url_asset.parsed_url).toBe(LANDING);
  });

  it('still rejects empty path segments and a bare root on a configured host', async () => {
    const options = { ...CONFIG, nestedPathHosts: ['go.brand.example'] };

    for (const url of ['https://go.brand.example/a//b', 'https://go.brand.example/']) {
      const result = await globalThis.processShortLinks(buildData(url), options);
      expect(result[0].link_url_asset.parsed_url).toBeUndefined();
    }
    expect(globalThis.HttpUtils.fetch).not.toHaveBeenCalled();
  });

  it('keeps rejecting query-bearing short links', async () => {
    const data = buildData('https://short.example/abc/xyz?source=facebook');

    const result = await globalThis.processShortLinks(data, {
      ...CONFIG,
      nestedPathHosts: ['short.example'],
    });

    expect(globalThis.HttpUtils.fetch).not.toHaveBeenCalled();
    expect(result).toBe(data);
  });

  it('fetches each unique short link once', async () => {
    const data = [
      ...buildData('https://short.example/abc123'),
      ...buildData('https://short.example/abc123'),
    ];

    const result = await globalThis.processShortLinks(data, CONFIG);

    expect(
      globalThis.HttpUtils.fetch.mock.calls.filter(
        ([url]) => url === 'https://short.example/abc123'
      )
    ).toHaveLength(1);
    expect(result.map(record => record.link_url_asset.parsed_url)).toEqual([LANDING, LANDING]);
  });

  it('follows a chain of redirects and resolves relative Location headers', async () => {
    globalThis.HttpUtils.fetch = vi.fn(async url => {
      if (url === 'https://short.example/abc123') return redirectTo('/step-two');
      if (url === 'https://short.example/step-two') return redirectTo(LANDING);
      return finalPage();
    });

    const result = await globalThis.processShortLinks(
      buildData('https://short.example/abc123'),
      CONFIG
    );

    expect(result[0].link_url_asset.parsed_url).toBe(LANDING);
  });

  it.each([
    ['loopback', 'http://127.0.0.1/admin'],
    ['private network', 'http://10.0.0.5/'],
    ['link-local metadata', 'http://169.254.169.254/latest/meta-data/'],
    ['localhost name', 'http://localhost:3000/'],
    ['internal name', 'http://metadata.google.internal/'],
    ['IPv6 loopback', 'http://[::1]/'],
    ['non-http scheme', 'file:///etc/passwd'],
  ])('does not follow a redirect to a %s address', async (_label, target) => {
    globalThis.HttpUtils.fetch = vi.fn(async () => redirectTo(target));

    const result = await globalThis.processShortLinks(
      buildData('https://short.example/abc123'),
      CONFIG
    );

    expect(globalThis.HttpUtils.fetch).toHaveBeenCalledTimes(1);
    expect(result[0].link_url_asset.parsed_url).toBeUndefined();
  });

  it('stops after the redirect limit and leaves the record unchanged', async () => {
    let hop = 0;
    globalThis.HttpUtils.fetch = vi.fn(async () =>
      redirectTo(`https://short.example/hop-${++hop}`)
    );

    const result = await globalThis.processShortLinks(
      buildData('https://short.example/abc123'),
      CONFIG
    );

    expect(globalThis.HttpUtils.fetch).toHaveBeenCalledTimes(21);
    expect(result[0].link_url_asset.parsed_url).toBeUndefined();
  });

  it('passes a timeout signal to every request', async () => {
    await globalThis.processShortLinks(buildData('https://short.example/abc123'), CONFIG);

    for (const [, options] of globalThis.HttpUtils.fetch.mock.calls) {
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('reuses resolved links from a shared cache across calls', async () => {
    const cache = new Map();
    const options = { ...CONFIG, resolvedLinksCache: cache };

    await globalThis.processShortLinks(buildData('https://short.example/abc123'), options);
    const second = await globalThis.processShortLinks(
      buildData('https://short.example/abc123'),
      options
    );

    const shortLinkCalls = globalThis.HttpUtils.fetch.mock.calls.filter(
      ([url]) => url === 'https://short.example/abc123'
    );
    expect(shortLinkCalls).toHaveLength(1);
    expect(cache.get('https://short.example/abc123')).toBe(LANDING);
    expect(second[0].link_url_asset.parsed_url).toBe(LANDING);
  });

  it('caches failed resolutions so a failing link is not retried within the run', async () => {
    globalThis.HttpUtils.fetch = vi.fn(async () => {
      throw new Error('network down');
    });
    const cache = new Map();
    const options = { ...CONFIG, resolvedLinksCache: cache };

    await globalThis.processShortLinks(buildData('https://short.example/abc123'), options);
    const second = await globalThis.processShortLinks(
      buildData('https://short.example/abc123'),
      options
    );

    expect(globalThis.HttpUtils.fetch).toHaveBeenCalledTimes(1);
    expect(second[0].link_url_asset.parsed_url).toBeUndefined();
  });

  it('resolves only the links missing from the cache', async () => {
    const cache = new Map([['https://short.example/known', 'https://example.com/known-landing']]);
    const data = [
      ...buildData('https://short.example/known'),
      ...buildData('https://short.example/abc123'),
    ];

    const result = await globalThis.processShortLinks(data, {
      ...CONFIG,
      resolvedLinksCache: cache,
    });

    expect(globalThis.HttpUtils.fetch.mock.calls.map(([url]) => url)).not.toContain(
      'https://short.example/known'
    );
    expect(result.map(record => record.link_url_asset.parsed_url)).toEqual([
      'https://example.com/known-landing',
      LANDING,
    ]);
  });

  it('leaves the record unchanged when resolution fails', async () => {
    globalThis.HttpUtils.fetch = vi.fn(async () => {
      throw new Error('network down');
    });

    const result = await globalThis.processShortLinks(
      buildData('https://short.example/abc123'),
      CONFIG
    );

    expect(result[0].link_url_asset.parsed_url).toBeUndefined();
    expect(result[0].link_url_asset.website_url).toBe('https://short.example/abc123');
  });
});

describe('resolveShortLinkFields', () => {
  const resolveWith = (records, specs, options = {}) =>
    globalThis.resolveShortLinkFields(records, specs, options);

  beforeEach(() => {
    mockSingleRedirect();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('writes the resolved URL to a sibling target for a string field and copies non-short links through', async () => {
    const records = [
      { click_url: 'https://short.example/abc123' },
      { click_url: 'https://brand.example/products/summer-sale' },
      { click_url: null },
    ];

    const result = await resolveWith(records, [{ field: 'click_url', target: 'click_url_parsed' }]);

    expect(result.map(r => r.click_url_parsed)).toEqual([
      LANDING,
      'https://brand.example/products/summer-sale',
      null,
    ]);
    expect(result.map(r => r.click_url)).toEqual(records.map(r => r.click_url));
  });

  it('resolves array fields in order and keeps a JSON-encoded array encoded', async () => {
    const records = [
      { final_urls: ['https://short.example/abc123', 'https://brand.example/landing/page'] },
      { final_urls: JSON.stringify(['https://short.example/abc123']) },
    ];

    const result = await resolveWith(records, [
      { field: 'final_urls', target: 'final_urls_parsed' },
    ]);

    expect(result[0].final_urls_parsed).toEqual([LANDING, 'https://brand.example/landing/page']);
    expect(result[1].final_urls_parsed).toBe(JSON.stringify([LANDING]));
  });

  it('writes parsed_url inside an object field only when the link resolved to something else', async () => {
    const records = [
      { link_url_asset: { id: '1', website_url: 'https://short.example/abc123' } },
      { link_url_asset: { id: '2', website_url: 'https://brand.example/landing/page' } },
    ];

    const result = await resolveWith(records, [
      { field: 'link_url_asset', urlKey: 'website_url', target: 'parsed_url' },
    ]);

    expect(result[0].link_url_asset.parsed_url).toBe(LANDING);
    expect(result[1].link_url_asset.parsed_url).toBeUndefined();
    expect(result[1]).toBe(records[1]);
  });

  it('fetches one URL once across several specs and records', async () => {
    const records = [
      { click_url: 'https://short.example/abc123', post_url: 'https://short.example/abc123' },
      { click_url: 'https://short.example/abc123', post_url: null },
    ];

    await resolveWith(records, [
      { field: 'click_url', target: 'click_url_parsed' },
      { field: 'post_url', target: 'post_url_parsed' },
    ]);

    const shortLinkCalls = globalThis.HttpUtils.fetch.mock.calls.filter(
      ([url]) => url === 'https://short.example/abc123'
    );
    expect(shortLinkCalls).toHaveLength(1);
  });

  it('returns the same array when there are no specs or no records', async () => {
    const records = [{ click_url: 'https://short.example/abc123' }];

    expect(await resolveWith(records, [])).toBe(records);
    expect(await resolveWith([], [{ field: 'click_url', target: 'click_url_parsed' }])).toEqual([]);
  });
});

describe('omitShortLinkTargets', () => {
  const node = {
    shortLinks: [
      { field: 'final_urls', target: 'final_urls_parsed' },
      { field: 'link_url_asset', urlKey: 'website_url', target: 'parsed_url' },
    ],
  };

  it('drops sibling targets and keeps everything else, including object-field names', () => {
    expect(
      globalThis.omitShortLinkTargets(node, [
        'id',
        'final_urls',
        'final_urls_parsed',
        'link_url_asset',
      ])
    ).toEqual(['id', 'final_urls', 'link_url_asset']);
  });

  it('returns the same list for nodes without a spec', () => {
    const fields = ['id'];
    expect(globalThis.omitShortLinkTargets({}, fields)).toBe(fields);
  });
});

describe('short link domains from the environment', () => {
  it('returns an empty list when the variable is unset or blank', () => {
    expect(globalThis.getShortLinkDomainsFromEnv({})).toEqual([]);
    expect(globalThis.getShortLinkDomainsFromEnv({ CONNECTOR_SHORT_LINK_DOMAINS: ' ' })).toEqual(
      []
    );
  });

  it('normalizes full URLs, ports, trailing dots, casing and separators, and ignores bare TLDs', () => {
    expect(
      globalThis.getShortLinkDomainsFromEnv({
        CONNECTOR_SHORT_LINK_DOMAINS:
          'https://Links.Example.com:8443/abc, short.example.; com localhost brand.example',
      })
    ).toEqual(['links.example.com', 'short.example', 'brand.example']);
  });
});

describe('short links state', () => {
  const NOW = 1_700_000_000_000;
  const DAY = 24 * 60 * 60 * 1000;

  it('loads valid entries and drops expired or malformed ones', () => {
    const raw = {
      'https://short.example/fresh': ['https://example.com/fresh', NOW - DAY],
      'https://short.example/stale': ['https://example.com/stale', NOW - 31 * DAY],
      'https://short.example/broken': 'not-an-entry',
    };

    const entries = globalThis.loadShortLinksState(raw, NOW);

    expect(Array.from(entries.keys())).toEqual(['https://short.example/fresh']);
    expect(entries.get('https://short.example/fresh')).toEqual({
      url: 'https://example.com/fresh',
      at: NOW - DAY,
    });
    expect(globalThis.loadShortLinksState(undefined, NOW).size).toBe(0);
  });

  it('persists only successful resolutions, newest first, and keeps the resolution time', () => {
    const entries = new Map([
      ['https://short.example/old', { url: 'https://example.com/old', at: NOW - 2 * DAY }],
      ['https://short.example/new', { url: 'https://example.com/new', at: NOW }],
      ['https://short.example/failed', { url: 'https://short.example/failed', at: NOW }],
    ]);

    const state = globalThis.buildShortLinksState(entries, NOW);

    expect(Object.keys(state)).toEqual(['https://short.example/new', 'https://short.example/old']);
    expect(state['https://short.example/old']).toEqual(['https://example.com/old', NOW - 2 * DAY]);
  });

  it('caps the entry count at 500 and the serialized size at 64 KiB', () => {
    const many = new Map(
      Array.from({ length: 600 }, (_, i) => [
        `https://short.example/${i}`,
        { url: `https://example.com/landing-${i}`, at: NOW - i },
      ])
    );
    expect(Object.keys(globalThis.buildShortLinksState(many, NOW))).toHaveLength(500);

    const huge = new Map(
      Array.from({ length: 400 }, (_, i) => [
        `https://short.example/${i}`,
        { url: `https://example.com/${'x'.repeat(300)}-${i}`, at: NOW - i },
      ])
    );
    const state = globalThis.buildShortLinksState(huge, NOW);
    expect(JSON.stringify(state).length).toBeLessThanOrEqual(64 * 1024);
    expect(Object.keys(state).length).toBeGreaterThan(0);
  });
});
