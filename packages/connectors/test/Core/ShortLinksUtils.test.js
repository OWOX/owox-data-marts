import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadGasClass } from '../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadGasClass(path.join(__dirname, '../../src/Core/Utils/ShortLinksUtils.js'));

const CONFIG = { shortLinkField: 'link_url_asset', urlFieldName: 'website_url' };

function buildData(websiteUrl) {
  return [{ link_url_asset: { id: '100000000000001', website_url: websiteUrl } }];
}

describe('processShortLinks', () => {
  beforeEach(() => {
    globalThis.HttpUtils = {
      fetch: vi.fn(async () => ({
        getUrl: () => 'https://example.com/landing-page',
      })),
    };
  });

  it('resolves nested-path short links on a configured host', async () => {
    const data = buildData('https://short.example/abc/xyz');

    const result = await globalThis.processShortLinks(data, {
      ...CONFIG,
      nestedPathHosts: ['short.example'],
    });

    expect(globalThis.HttpUtils.fetch).toHaveBeenCalledWith('https://short.example/abc/xyz', {
      method: 'GET',
    });
    expect(result).toEqual([
      {
        link_url_asset: {
          id: '100000000000001',
          website_url: 'https://short.example/abc/xyz',
          parsed_url: 'https://example.com/landing-page',
        },
      },
    ]);
  });

  it('matches subdomains of a configured host', async () => {
    const data = buildData('https://brand.short.example/abc/xyz');

    await globalThis.processShortLinks(data, { ...CONFIG, nestedPathHosts: ['short.example'] });

    expect(globalThis.HttpUtils.fetch).toHaveBeenCalledTimes(1);
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

    expect(globalThis.HttpUtils.fetch).toHaveBeenCalledWith('https://short.example/abc123', {
      method: 'GET',
    });
    expect(result[0].link_url_asset.parsed_url).toBe('https://example.com/landing-page');
  });

  it('keeps rejecting single-segment URLs with a trailing slash', async () => {
    const data = buildData('https://brand.example/shop/');

    const result = await globalThis.processShortLinks(data, CONFIG);

    expect(globalThis.HttpUtils.fetch).not.toHaveBeenCalled();
    expect(result).toBe(data);
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

    expect(globalThis.HttpUtils.fetch).toHaveBeenCalledTimes(1);
    expect(result.map(record => record.link_url_asset.parsed_url)).toEqual([
      'https://example.com/landing-page',
      'https://example.com/landing-page',
    ]);
  });

  it('leaves the record unchanged when resolution fails', async () => {
    globalThis.HttpUtils.fetch = vi.fn(async () => {
      throw new Error('network down');
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const data = buildData('https://short.example/abc123');

    const result = await globalThis.processShortLinks(data, CONFIG);

    expect(result[0].link_url_asset.parsed_url).toBeUndefined();
    expect(result[0].link_url_asset.website_url).toBe('https://short.example/abc123');
  });
});
