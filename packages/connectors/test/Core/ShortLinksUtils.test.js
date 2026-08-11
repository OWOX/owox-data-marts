import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadGasClass } from '../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadGasClass(path.join(__dirname, '../../src/Core/Utils/ShortLinksUtils.js'));

const CONFIG = { shortLinkField: 'link_url_asset', urlFieldName: 'website_url' };
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
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  // Tests below reassign globalThis.fetch outright; this still restores the real one.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves nested-path short links on a configured host', async () => {
    const data = buildData('https://short.example/abc/xyz');

    const result = await globalThis.processShortLinks(data, {
      ...CONFIG,
      nestedPathHosts: ['short.example'],
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

    await globalThis.processShortLinks(data, { ...CONFIG, nestedPathHosts: ['short.example'] });

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not treat nested paths on unconfigured hosts as short links', async () => {
    const data = buildData('https://example.com/products/summer-sale');

    const result = await globalThis.processShortLinks(data, {
      ...CONFIG,
      nestedPathHosts: ['short.example'],
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result).toBe(data);
  });

  it('does not treat nested paths as short links when no hosts are configured', async () => {
    const data = buildData('https://short.example/abc/xyz');

    const result = await globalThis.processShortLinks(data, CONFIG);

    expect(globalThis.fetch).not.toHaveBeenCalled();
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

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result).toBe(data);
  });

  it('keeps rejecting links with UTM tags in the fragment', async () => {
    const data = buildData('https://brand.example/landing#utm_source=facebook&utm_medium=cpc');

    const result = await globalThis.processShortLinks(data, CONFIG);

    expect(globalThis.fetch).not.toHaveBeenCalled();
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
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('keeps rejecting query-bearing short links', async () => {
    const data = buildData('https://short.example/abc/xyz?source=facebook');

    const result = await globalThis.processShortLinks(data, {
      ...CONFIG,
      nestedPathHosts: ['short.example'],
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result).toBe(data);
  });

  it('fetches each unique short link once', async () => {
    const data = [
      ...buildData('https://short.example/abc123'),
      ...buildData('https://short.example/abc123'),
    ];

    const result = await globalThis.processShortLinks(data, CONFIG);

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
    globalThis.fetch = vi.fn(async () => redirectTo(target));

    const result = await globalThis.processShortLinks(
      buildData('https://short.example/abc123'),
      CONFIG
    );

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(result[0].link_url_asset.parsed_url).toBeUndefined();
  });

  it('stops after the redirect limit and leaves the record unchanged', async () => {
    let hop = 0;
    globalThis.fetch = vi.fn(async () => redirectTo(`https://short.example/hop-${++hop}`));

    const result = await globalThis.processShortLinks(
      buildData('https://short.example/abc123'),
      CONFIG
    );

    expect(globalThis.fetch).toHaveBeenCalledTimes(21);
    expect(result[0].link_url_asset.parsed_url).toBeUndefined();
  });

  it('passes a timeout signal to every request', async () => {
    await globalThis.processShortLinks(buildData('https://short.example/abc123'), CONFIG);

    for (const [, options] of globalThis.fetch.mock.calls) {
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('leaves the record unchanged when resolution fails', async () => {
    globalThis.fetch = vi.fn(async () => {
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
