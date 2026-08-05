import { jest } from '@jest/globals';

import { OWOXApiClient, type OWOXTransport } from './index.js';
import { decodeBase64Url, encodeBase64Url } from './base64url.js';

function recordingTransport() {
  const calls: { method: string; path: string; body?: unknown }[] = [];

  const transport: OWOXTransport = {
    getJson: async <T>(path: string) => {
      calls.push({ method: 'getJson', path });
      return [] as T;
    },
    postJson: async <T>(path: string, body: unknown) => {
      calls.push({ method: 'postJson', path, body });
      // Shaped per resource: each one validates what it gets back, which is itself
      // evidence that the injected transport reaches the real parsing code.
      return (path.includes('markdown') ? '<h1>x</h1>' : { publicationId: 'pub1' }) as T;
    },
    putJson: async <T>(path: string, body: unknown) => {
      calls.push({ method: 'putJson', path, body });
      return {} as T;
    },
    getStream: async (path: string) => {
      calls.push({ method: 'getStream', path });
      return new Response('');
    },
  };

  return { transport, calls };
}

describe('injected transport', () => {
  /**
   * The property the whole plugin runtime rests on: with a transport supplied, the
   * client holds no credential and issues no request of its own. A plugin gets a real
   * OWOXApiClient whose every call is brokered by the host.
   */
  it('routes resources through the transport and never touches fetch', async () => {
    const fetchSpy = jest.fn();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    try {
      const { transport, calls } = recordingTransport();
      const client = new OWOXApiClient({ transport });

      await client.storages.list();
      await client.markdown.parseToHtml({ markdown: '# x' });

      expect(calls.map(call => call.method)).toEqual(['getJson', 'postJson']);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('needs no credential and no api origin', () => {
    const { transport } = recordingTransport();

    expect(() => new OWOXApiClient({ transport })).not.toThrow();
  });

  // A transport with nothing to authenticate must not make the shared call blow up.
  it('tolerates a transport that cannot authenticate', async () => {
    const { transport } = recordingTransport();

    await expect(new OWOXApiClient({ transport }).authenticate()).resolves.toBeUndefined();
  });
});

describe('base64url', () => {
  it.each(['', 'plain', '{"a":1}', 'Ünïcödé ✓ 中文', '??>>~~'])('round-trips %p', value => {
    expect(decodeBase64Url(encodeBase64Url(value))).toBe(value);
  });

  // The encoding has to stay byte-identical: an API key encoded by an older build must
  // still decode, and the backend reads what this produces.
  it('matches what node produced before Buffer was dropped', () => {
    const value = JSON.stringify({ apiOrigin: 'https://example.test', apiKeyId: 'pmk_abc' });

    expect(encodeBase64Url(value)).toBe(Buffer.from(value, 'utf8').toString('base64url'));
    expect(decodeBase64Url(Buffer.from(value, 'utf8').toString('base64url'))).toBe(value);
  });

  it('emits no padding and no url-unsafe characters', () => {
    const encoded = encodeBase64Url('any value at all ??>>');

    expect(encoded).not.toContain('=');
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
  });
});
