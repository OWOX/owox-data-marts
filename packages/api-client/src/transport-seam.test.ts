import { jest } from '@jest/globals';

import { OWOXApiClient, OWOXConfigError, type OWOXTransport } from './index.js';
import { decodeBase64Url, encodeBase64Url } from './base64url.js';
import type { OWOXTransportWithLowLevelWrites } from './transport.js';

function recordingTransport() {
  const calls: { method: string; path: string; body?: unknown }[] = [];

  const transport: OWOXTransportWithLowLevelWrites = {
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
    patchJson: async <T>(path: string, body: unknown) => {
      calls.push({ method: 'patchJson', path, body });
      return { id: 'dm-1', title: 'Updated' } as T;
    },
    deleteJson: async <T>(path: string) => {
      calls.push({ method: 'deleteJson', path });
      return undefined as T;
    },
    getStream: async (path: string) => {
      calls.push({ method: 'getStream', path });
      return new Response('');
    },
  };

  return { transport, calls };
}

function legacyTransport(): OWOXTransport {
  return {
    getJson: async <T>() => [] as T,
    postJson: async <T>() => ({}) as T,
    putJson: async <T>() => ({}) as T,
    getStream: async () => new Response(''),
  };
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

  it('accepts a custom transport that implements the original method set', async () => {
    const client = new OWOXApiClient({ transport: legacyTransport() });

    await expect(client.getJson('/api/data-marts')).resolves.toEqual([]);
  });

  it.each([
    ['patchJson', (client: OWOXApiClient) => client.patchJson('/api/x', {})],
    ['deleteJson', (client: OWOXApiClient) => client.deleteJson('/api/x')],
  ] as const)(
    'reports when an injected legacy transport does not support %s',
    async (method, call) => {
      const client = new OWOXApiClient({ transport: legacyTransport() });

      await expect(call(client)).rejects.toEqual(
        new OWOXConfigError(`Injected OWOX transport does not support ${method}()`)
      );
    }
  );

  it('forwards low-level PATCH and DELETE calls through the injected transport', async () => {
    const { transport, calls } = recordingTransport();
    const client = new OWOXApiClient({ transport });

    await expect(client.patchJson('/api/data-marts/dm-1', { title: 'Updated' })).resolves.toEqual({
      id: 'dm-1',
      title: 'Updated',
    });
    await expect(client.deleteJson('/api/data-marts/dm-1')).resolves.toBeUndefined();

    expect(calls).toEqual([
      { method: 'patchJson', path: '/api/data-marts/dm-1', body: { title: 'Updated' } },
      { method: 'deleteJson', path: '/api/data-marts/dm-1' },
    ]);
  });

  it('forwards a JSON-normalized PATCH body through an injected transport', async () => {
    const { transport, calls } = recordingTransport();
    const client = new OWOXApiClient({ transport });

    await client.patchJson('/api/data-marts/dm-1', {
      title: 'Updated',
      callback: () => undefined,
      values: [1, undefined],
    });

    expect(calls).toEqual([
      {
        method: 'patchJson',
        path: '/api/data-marts/dm-1',
        body: { title: 'Updated', values: [1, null] },
      },
    ]);
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
