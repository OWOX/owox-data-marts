import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadGasClass } from '../support/loadGasClass.js';
import { SsrfGuard } from '../../src/Core/Declarative/SsrfGuard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadGasClass(path.join(__dirname, '../../src/Core/Utils/ShortLinksUtils.js'));

// The resolver vets each host's DNS answers through the bundle's SsrfGuard. Tests answer with
// a public address, unless one sets `dnsAnswer` to a private one.
const PUBLIC_ADDRESS = '93.184.216.34';
let dnsAnswer = PUBLIC_ADDRESS;
globalThis.SsrfGuard = class extends SsrfGuard {
  constructor(hosts) {
    super(hosts, { lookup: async () => [{ address: dnsAnswer, family: 4 }] });
  }
};

const CONFIG = { shortLinkField: 'link_url_asset', urlFieldName: 'website_url' };
// Test domains are not built-in services, so tests allowlist them explicitly
const ALLOW = ['short.example'];
const LANDING = 'https://example.com/landing-page';

// Native fetch responses: under `redirect: 'manual'` Node hands back the 3xx itself.
const redirectTo = location => new Response(null, { status: 302, headers: { location } });
const finalPage = () => new Response(null, { status: 200 });

function buildData(websiteUrl) {
  return [{ link_url_asset: { id: '100000000000001', website_url: websiteUrl } }];
}

/** Mocks a server that redirects the first request to LANDING and then answers 200. */
function mockSingleRedirect() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async url => (url === LANDING ? finalPage() : redirectTo(LANDING)))
  );
}

describe('processShortLinks', () => {
  beforeEach(() => {
    mockSingleRedirect();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  // Tests below reassign globalThis.fetch outright; this still restores the real one.
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resolves nested-path short links on a configured host', async () => {
    const data = buildData('https://short.example/abc/xyz');

    const result = await globalThis.processShortLinks(data, {
      ...CONFIG,
      allowedHosts: ['short.example'],
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
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

    const result = await globalThis.processShortLinks(data, {
      ...CONFIG,
      allowedHosts: ['short.example'],
    });

    // One request to the short link service; the landing page it names is not requested
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(result[0].link_url_asset.parsed_url).toBe(LANDING);
  });

  it('does not treat nested paths on unconfigured hosts as short links', async () => {
    const data = buildData('https://example.com/products/summer-sale');

    const result = await globalThis.processShortLinks(data, {
      ...CONFIG,
      allowedHosts: ['short.example'],
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result).toBe(data);
  });

  it('does not resolve any link, one-segment or nested, on a domain outside the allowlist', async () => {
    for (const url of ['https://unlisted.example/abc123', 'https://unlisted.example/abc/xyz']) {
      const result = await globalThis.processShortLinks(buildData(url), { ...CONFIG });
      expect(result[0].link_url_asset.parsed_url).toBeUndefined();
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('resolves one-segment links on built-in services without any configuration', async () => {
    const data = buildData('https://bit.ly/abc123');

    const result = await globalThis.processShortLinks(data, { ...CONFIG });

    expect(result[0].link_url_asset.parsed_url).toBe(LANDING);
  });

  it('resolves one-segment links on configured domains', async () => {
    const data = buildData('https://short.example/abc123');

    const result = await globalThis.processShortLinks(data, {
      ...CONFIG,
      allowedHosts: ['short.example'],
    });

    expect(result[0].link_url_asset.parsed_url).toBe(LANDING);
  });

  it('does not treat look-alike hosts as allowlisted services', async () => {
    for (const url of ['https://evilbit.ly/abc123', 'https://microsoft.co/abc123']) {
      const result = await globalThis.processShortLinks(buildData(url), { ...CONFIG });
      expect(result[0].link_url_asset.parsed_url).toBeUndefined();
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('stops at the first redirect that leaves the allowlist and does not request it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => redirectTo('http://any-host.example:8080/landing'))
    );

    const result = await globalThis.processShortLinks(buildData('https://is.gd/abc123'), {
      ...CONFIG,
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(result[0].link_url_asset.parsed_url).toBe('http://any-host.example:8080/landing');
  });

  it('does not request an allowlisted host whose DNS answer is private', async () => {
    dnsAnswer = '10.0.0.5';
    vi.stubGlobal('fetch', vi.fn());

    try {
      const result = await globalThis.processShortLinks(buildData('https://bit.ly/abc123'), {
        ...CONFIG,
      });

      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(result[0].link_url_asset.parsed_url).toBeUndefined();
    } finally {
      dnsAnswer = PUBLIC_ADDRESS;
    }
  });

  it('keeps following redirects between allowlisted short link services', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async url =>
        url === 'https://bit.ly/abc123'
          ? redirectTo('https://tinyurl.com/xyz')
          : redirectTo(LANDING)
      )
    );

    const result = await globalThis.processShortLinks(buildData('https://bit.ly/abc123'), {
      ...CONFIG,
    });

    expect(globalThis.fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://bit.ly/abc123',
      'https://tinyurl.com/xyz',
    ]);
    expect(result[0].link_url_asset.parsed_url).toBe(LANDING);
  });

  it.each([408, 429, 500, 503])(
    'treats a %s answer from the service as a failed request, not a landing page',
    async status => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(null, { status }))
      );
      const failedLinks = new Set();
      const cache = new Map();

      await globalThis.resolveShortLinkFields(
        [{ click_url: 'https://bit.ly/abc123' }],
        [{ field: 'click_url', target: 'click_url_parsed' }],
        { resolvedLinksCache: cache, failedLinks }
      );

      expect(Array.from(failedLinks)).toEqual(['https://bit.ly/abc123']);
    }
  );

  it('keeps a 404 answer as an answer, since a deleted short link stays deleted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 }))
    );
    const failedLinks = new Set();

    await globalThis.resolveShortLinkFields(
      [{ click_url: 'https://bit.ly/gone' }],
      [{ field: 'click_url', target: 'click_url_parsed' }],
      { failedLinks }
    );

    expect(failedLinks.size).toBe(0);
  });

  it('does not apply a cached answer to a link outside the allowlist', async () => {
    const cache = new Map([['https://unlisted.example/abc123', LANDING]]);

    const result = await globalThis.resolveShortLinkFields(
      [{ click_url: 'https://unlisted.example/abc123' }],
      [{ field: 'click_url', target: 'click_url_parsed' }],
      { resolvedLinksCache: cache }
    );

    expect(result[0].click_url_parsed).toBe('https://unlisted.example/abc123');
  });

  it('keeps rejecting links with UTM tags in the fragment, even on an allowlisted host', async () => {
    const data = buildData('https://short.example/landing#utm_source=facebook&utm_medium=cpc');

    const result = await globalThis.processShortLinks(data, {
      ...CONFIG,
      allowedHosts: ['short.example'],
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result).toBe(data);
  });

  it('accepts one trailing slash on an allowlisted host', async () => {
    const data = buildData('https://go.brand.example/summer/');

    const result = await globalThis.processShortLinks(data, {
      ...CONFIG,
      allowedHosts: ['go.brand.example'],
    });

    expect(result[0].link_url_asset.parsed_url).toBe(LANDING);
  });

  it('still rejects empty path segments and a bare root on a configured host', async () => {
    const options = { ...CONFIG, allowedHosts: ['go.brand.example'] };

    for (const url of ['https://go.brand.example/a//b', 'https://go.brand.example/']) {
      const result = await globalThis.processShortLinks(buildData(url), options);
      expect(result[0].link_url_asset.parsed_url).toBeUndefined();
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('keeps rejecting query-bearing short links', async () => {
    const data = buildData('https://short.example/abc/xyz?source=facebook');

    const result = await globalThis.processShortLinks(data, {
      ...CONFIG,
      allowedHosts: ['short.example'],
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result).toBe(data);
  });

  it('fetches each unique short link once', async () => {
    const data = [
      ...buildData('https://short.example/abc123'),
      ...buildData('https://short.example/abc123'),
    ];

    const result = await globalThis.processShortLinks(data, { ...CONFIG, allowedHosts: ALLOW });

    expect(
      globalThis.fetch.mock.calls.filter(([url]) => url === 'https://short.example/abc123')
    ).toHaveLength(1);
    expect(result.map(record => record.link_url_asset.parsed_url)).toEqual([LANDING, LANDING]);
  });

  it('follows a chain of redirects and resolves relative Location headers', async () => {
    globalThis.fetch = vi.fn(async url => {
      if (url === 'https://short.example/abc123') return redirectTo('/step-two');
      if (url === 'https://short.example/step-two') return redirectTo(LANDING);
      return finalPage();
    });

    const result = await globalThis.processShortLinks(buildData('https://short.example/abc123'), {
      ...CONFIG,
      allowedHosts: ALLOW,
    });

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
    globalThis.fetch = vi.fn(async () => redirectTo(target));

    const result = await globalThis.processShortLinks(buildData('https://short.example/abc123'), {
      ...CONFIG,
      allowedHosts: ALLOW,
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(result[0].link_url_asset.parsed_url).toBeUndefined();
  });

  it('stops after the redirect limit and leaves the record unchanged', async () => {
    let hop = 0;
    globalThis.fetch = vi.fn(async () => redirectTo(`https://short.example/hop-${++hop}`));

    const result = await globalThis.processShortLinks(buildData('https://short.example/abc123'), {
      ...CONFIG,
      allowedHosts: ALLOW,
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(21);
    expect(result[0].link_url_asset.parsed_url).toBeUndefined();
  });

  it('passes a timeout signal to every request', async () => {
    await globalThis.processShortLinks(buildData('https://short.example/abc123'), {
      ...CONFIG,
      allowedHosts: ALLOW,
    });

    for (const [, options] of globalThis.fetch.mock.calls) {
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('reuses resolved links from a shared cache across calls', async () => {
    const cache = new Map();
    const options = { ...CONFIG, allowedHosts: ALLOW, resolvedLinksCache: cache };

    await globalThis.processShortLinks(buildData('https://short.example/abc123'), options);
    const second = await globalThis.processShortLinks(
      buildData('https://short.example/abc123'),
      options
    );

    const shortLinkCalls = globalThis.fetch.mock.calls.filter(
      ([url]) => url === 'https://short.example/abc123'
    );
    expect(shortLinkCalls).toHaveLength(1);
    expect(cache.get('https://short.example/abc123')).toBe(LANDING);
    expect(second[0].link_url_asset.parsed_url).toBe(LANDING);
  });

  it('caches failed resolutions so a failing link is not retried within the run', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    });
    const cache = new Map();
    const options = { ...CONFIG, allowedHosts: ALLOW, resolvedLinksCache: cache };

    await globalThis.processShortLinks(buildData('https://short.example/abc123'), options);
    const second = await globalThis.processShortLinks(
      buildData('https://short.example/abc123'),
      options
    );

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
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
      allowedHosts: ALLOW,
      resolvedLinksCache: cache,
    });

    expect(globalThis.fetch.mock.calls.map(([url]) => url)).not.toContain(
      'https://short.example/known'
    );
    expect(result.map(record => record.link_url_asset.parsed_url)).toEqual([
      'https://example.com/known-landing',
      LANDING,
    ]);
  });

  it('leaves the record unchanged when resolution fails', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    });

    const result = await globalThis.processShortLinks(buildData('https://short.example/abc123'), {
      ...CONFIG,
      allowedHosts: ALLOW,
    });

    expect(result[0].link_url_asset.parsed_url).toBeUndefined();
    expect(result[0].link_url_asset.website_url).toBe('https://short.example/abc123');
  });

  // The host reads any raw stderr line as a run failure, so a dead short link in an
  // otherwise complete import must be reported on stdout.
  it('reports a link it could not resolve on stdout, not stderr', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    });
    const stdout = vi.mocked(console.log);
    const stderr = [
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
    ];

    await globalThis.processShortLinks(buildData('https://short.example/abc123'), {
      ...CONFIG,
      allowedHosts: ALLOW,
    });

    expect(stdout).toHaveBeenCalledWith(
      'Failed to resolve short link https://short.example/abc123: network down'
    );
    for (const spy of stderr) expect(spy).not.toHaveBeenCalled();
  });

  // stdout is the connector's message channel: credentials and line breaks must not reach it
  it('logs only the origin and path of a link it could not resolve', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    });

    await globalThis.processShortLinks(
      buildData('https://user:secret@short.example/abc123#%0A{"type":"x"}'),
      { ...CONFIG, allowedHosts: ALLOW }
    );

    expect(vi.mocked(console.log)).toHaveBeenCalledWith(
      'Failed to resolve short link https://short.example/abc123: network down'
    );
  });
});

describe('resolveShortLinkFields', () => {
  const resolveWith = (records, specs, options = {}) =>
    globalThis.resolveShortLinkFields(records, specs, { allowedHosts: ALLOW, ...options });

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

    const shortLinkCalls = globalThis.fetch.mock.calls.filter(
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

describe('failed and unanswered requests', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reports failed requests and leaves out URLs that answered without a redirect', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async url => {
        if (url === 'https://short.example/down') throw new Error('network down');
        return finalPage();
      })
    );
    const failedLinks = new Set();
    const cache = new Map();

    const result = await globalThis.resolveShortLinkFields(
      [{ click_url: 'https://short.example/down' }, { click_url: 'https://brand.example/sale' }],
      [{ field: 'click_url', target: 'click_url_parsed' }],
      { allowedHosts: ['short.example', 'brand.example'], resolvedLinksCache: cache, failedLinks }
    );

    expect(Array.from(failedLinks)).toEqual(['https://short.example/down']);
    expect(cache.get('https://brand.example/sale')).toBe('https://brand.example/sale');
    expect(result.map(r => r.click_url_parsed)).toEqual([
      'https://short.example/down',
      'https://brand.example/sale',
    ]);
  });

  // A refusal depends on the URL and its DNS answer alone, so asking again on the next run
  // cannot change it
  it.each([
    ['a non-public address', 'tel:+10000000000', PUBLIC_ADDRESS],
    ['an http address on an allowlisted service', 'http://bit.ly/xyz', PUBLIC_ADDRESS],
    ['an allowlisted service whose DNS answer is private', 'https://bit.ly/xyz', '10.0.0.5'],
  ])('remembers a redirect to %s as answered, keeping the original link', async (_, to, dns) => {
    // The short link answers from a public address; its redirect target then resolves to `dns`
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        dnsAnswer = dns;
        return redirectTo(to);
      })
    );
    const failedLinks = new Set();
    const cache = new Map();

    try {
      const result = await globalThis.resolveShortLinkFields(
        [{ click_url: 'https://short.example/call' }],
        [{ field: 'click_url', target: 'click_url_parsed' }],
        { allowedHosts: ALLOW, resolvedLinksCache: cache, failedLinks }
      );

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(failedLinks.size).toBe(0);
      expect(cache.get('https://short.example/call')).toBe('https://short.example/call');
      expect(result[0].click_url_parsed).toBe('https://short.example/call');
    } finally {
      dnsAnswer = PUBLIC_ADDRESS;
    }
  });

  it('retries a link whose DNS lookup did not answer', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const failedLinks = new Set();
    const stubbedGuard = globalThis.SsrfGuard;
    globalThis.SsrfGuard = class extends SsrfGuard {
      constructor(hosts) {
        const lookup = async () => {
          throw Object.assign(new Error('timeout'), { code: 'EAI_AGAIN' });
        };
        super(hosts, { lookup, sleep: async () => {} });
      }
    };

    try {
      await globalThis.resolveShortLinkFields(
        [{ click_url: 'https://short.example/call' }],
        [{ field: 'click_url', target: 'click_url_parsed' }],
        { allowedHosts: ALLOW, failedLinks }
      );
    } finally {
      globalThis.SsrfGuard = stubbedGuard;
    }

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(Array.from(failedLinks)).toEqual(['https://short.example/call']);
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
  it('accepts *.host and .host entries as the host itself', () => {
    expect(
      globalThis.getShortLinkDomainsFromEnv({
        CONNECTOR_SHORT_LINK_DOMAINS: '*.links.example.com, .short.example',
      })
    ).toEqual(['links.example.com', 'short.example']);
  });

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

  it('stores Unicode domains in the punycode form URLs use, and ignores IP addresses', () => {
    const hosts = globalThis.getShortLinkDomainsFromEnv({
      CONNECTOR_SHORT_LINK_DOMAINS: 'bücher.example, 203.0.113.7',
    });

    expect(hosts).toEqual(['xn--bcher-kva.example']);
    expect(hosts[0]).toBe(new URL('https://bücher.example/a').hostname);
  });
});

describe('short links state', () => {
  const NOW = 1_700_000_000_000;
  const DAY = 24 * 60 * 60 * 1000;

  it('loads valid entries, maps a null target to the URL itself, and drops expired or malformed ones', () => {
    const raw = {
      'https://short.example/fresh': ['https://example.com/fresh', NOW - DAY],
      'https://brand.example/sale': [null, NOW - DAY],
      'https://short.example/stale': ['https://example.com/stale', NOW - 31 * DAY],
      'https://short.example/broken': 'not-an-entry',
      'https://short.example/bad-target': [42, NOW],
    };

    const entries = globalThis.loadShortLinksState(raw, NOW);

    expect(Array.from(entries.keys())).toEqual([
      'https://short.example/fresh',
      'https://brand.example/sale',
    ]);
    expect(entries.get('https://short.example/fresh')).toEqual({
      url: 'https://example.com/fresh',
      at: NOW - DAY,
    });
    expect(entries.get('https://brand.example/sale')).toEqual({
      url: 'https://brand.example/sale',
      at: NOW - DAY,
    });
    expect(globalThis.loadShortLinksState(undefined, NOW).size).toBe(0);
  });

  it('persists newest first, stores a URL that did not redirect as null, and keeps the resolution time', () => {
    const entries = new Map([
      ['https://short.example/old', { url: 'https://example.com/old', at: NOW - 2 * DAY }],
      ['https://brand.example/sale', { url: 'https://brand.example/sale', at: NOW - DAY }],
      ['https://short.example/new', { url: 'https://example.com/new', at: NOW }],
      ['https://short.example/expired', { url: 'https://example.com/expired', at: NOW - 31 * DAY }],
    ]);

    const state = globalThis.buildShortLinksState(entries, NOW);

    expect(Object.keys(state)).toEqual([
      'https://short.example/new',
      'https://brand.example/sale',
      'https://short.example/old',
    ]);
    expect(state['https://brand.example/sale']).toEqual([null, NOW - DAY]);
    expect(state['https://short.example/old']).toEqual(['https://example.com/old', NOW - 2 * DAY]);
  });

  it('fills the 24 KiB budget entry by entry instead of dropping half of it', () => {
    const entry = i => [
      `https://short.example/${String(i).padStart(4, '0')}`,
      {
        url: `https://example.com/landing/${'x'.repeat(70)}/${String(i).padStart(4, '0')}`,
        at: NOW - i,
      },
    ];
    const entries = new Map(Array.from({ length: 400 }, (_, i) => entry(i)));

    const state = globalThis.buildShortLinksState(entries, NOW);
    const size = JSON.stringify(state).length;
    const kept = Object.keys(state).length;
    const nextEntrySize =
      JSON.stringify({ [entry(kept)[0]]: [entry(kept)[1].url, NOW] }).length - 1;

    expect(size).toBeLessThanOrEqual(24 * 1024);
    // The next entry would not have fitted, so no budget was left unused
    expect(size + nextEntrySize).toBeGreaterThan(24 * 1024);
    // Newest entries win
    expect(Object.keys(state)[0]).toBe(entry(0)[0]);
    expect(Object.keys(state)[kept - 1]).toBe(entry(kept - 1)[0]);
  });
});
