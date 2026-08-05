import type { PluginRequest, PluginRequestInput, PluginResponse } from './protocol';
import { PLUGIN_PROTOCOL_VERSION } from './protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPluginHostBridge, type PluginHostBridge } from './pluginHostBridge';

const RUNTIME_TOKEN = 'runtime-token-that-must-not-leak';
const API_ORIGIN = 'https://app.owox.test';

const CONTEXT = {
  pluginId: 'p1',
  installationId: 'i1',
  projectId: 'j1',
  userId: 'u1',
  theme: 'light' as const,
};

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Stands in for the plugin frame: a window object the bridge will accept as its
 * contentWindow, plus a record of everything the host posts to it.
 */
function pluginFrame() {
  const posted: { data: unknown; transfer?: Transferable[] }[] = [];

  const contentWindow = {
    postMessage: (data: unknown, _origin: string, transfer?: Transferable[]) => {
      posted.push({ data, transfer });
    },
  };

  const iframe = { contentWindow, src: '' } as unknown as HTMLIFrameElement;

  return { iframe, contentWindow, posted };
}

function announceReady(contentWindow: object) {
  const event = new MessageEvent('message', {
    data: { owox: 'plugin-ready', v: PLUGIN_PROTOCOL_VERSION },
    origin: 'null',
  });
  Object.defineProperty(event, 'source', { value: contentWindow });
  window.dispatchEvent(event);
}

interface Harness {
  bridge: PluginHostBridge;
  send: (request: PluginRequestInput & { id?: string }) => Promise<PluginResponse>;
  tell: (request: PluginRequestInput) => void;
  raw: (data: unknown) => void;
  /** The nonce the host sent with host-init, as the SDK would read it. */
  nonce: string;
  posted: { data: unknown; transfer?: Transferable[] }[];
  fetchMock: ReturnType<typeof vi.fn>;
  onOpenExternal: ReturnType<typeof vi.fn>;
  onNavigate: ReturnType<typeof vi.fn>;
  onBroken: ReturnType<typeof vi.fn>;
}

async function harness(
  fetchImpl: (url: string, init: RequestInit) => Promise<Response> = async () =>
    new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
  /** Off for the tests that are about the handshake itself rather than what follows it. */
  greet = true
): Promise<Harness> {
  const frame = pluginFrame();
  const fetchMock = vi.fn(fetchImpl);
  vi.stubGlobal('fetch', fetchMock);

  const onOpenExternal = vi.fn();
  const onNavigate = vi.fn();
  const onBroken = vi.fn();

  const bridge = createPluginHostBridge({
    iframe: frame.iframe,
    src: 'https://plugin.example.test/',
    apiOrigin: API_ORIGIN,
    context: CONTEXT,
    fetchRuntimeToken: () => Promise.resolve({ runtimeToken: RUNTIME_TOKEN, expiresIn: 900 }),
    onOpenExternal,
    onNavigate,
    onBroken,
  });

  announceReady(frame.contentWindow);
  await flush();

  const init = frame.posted[0].data as { owox: string; nonce: string };
  expect(init.owox).toBe('host-init');
  const port = frame.posted[0].transfer?.[0] as MessagePort;

  // What the SDK does the moment it binds the port, and what the host now requires before
  // it will serve anything.
  if (greet) {
    port.start();
    port.postMessage({ owox: 'plugin-hello', v: PLUGIN_PROTOCOL_VERSION, nonce: init.nonce });
  }

  const send = (request: PluginRequestInput & { id?: string }) =>
    new Promise<PluginResponse>(resolve => {
      const id = request.id ?? crypto.randomUUID();
      port.onmessage = (event: MessageEvent<PluginResponse>) => {
        resolve(event.data);
      };
      port.start();
      port.postMessage({ ...request, id } as PluginRequest);
    });

  // openExternal and navigate are fire-and-forget: the host acts, and there is nothing
  // meaningful to answer. Waiting for a reply would hang.
  const tell = (request: PluginRequestInput) => {
    port.start();
    port.postMessage({ ...request, id: crypto.randomUUID() } as PluginRequest);
  };

  /** Anything a plugin can put on the port, including what the protocol never defines. */
  const raw = (data: unknown) => {
    port.start();
    port.postMessage(data);
  };

  return {
    bridge,
    send,
    tell,
    raw,
    nonce: init.nonce,
    posted: frame.posted,
    fetchMock,
    onOpenExternal,
    onNavigate,
    onBroken,
  };
}

describe('plugin host bridge', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  describe('exfiltration guard', () => {
    /**
     * The highest-severity check in the iteration.
     *
     * `new URL('//evil.example/x', origin)` resolves to `https://evil.example/x`, so a
     * naive string prefix test would let a plugin make the host send the runtime token
     * to an attacker.
     */
    it.each([
      ['a protocol-relative host', '//evil.example/x'],
      ['an absolute foreign url', 'https://evil.example/x'],
      ['a path outside /api/', '/auth/context'],
      ['a traversal out of /api/', '/api/../auth/context'],
    ])('refuses %s and issues no request at all', async (_label, path) => {
      const h = await harness();

      const response = await h.send({ kind: 'api', method: 'GET', path });

      expect(response).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
      expect(h.fetchMock).not.toHaveBeenCalled();
    });

    it('refuses a method a plugin has no business using', async () => {
      const h = await harness();

      const response = await h.send({
        kind: 'api',
        method: 'DELETE',
      } as unknown as PluginRequestInput);

      expect(response).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
      expect(h.fetchMock).not.toHaveBeenCalled();
    });

    it('allows an ordinary api path', async () => {
      const h = await harness();

      const response = await h.send({ kind: 'api', method: 'GET', path: '/api/data-marts' });

      expect(response).toMatchObject({ ok: true });
      expect(String(h.fetchMock.mock.calls[0][0])).toBe(`${API_ORIGIN}/api/data-marts`);
    });

    // `?column=a&column=b` is how the API client asks for two columns. Assigning with
    // `set` kept only the last, so a plugin traversed a narrower dataset than the same
    // call makes outside the iframe -- wrong data rather than an error.
    it('appends every value of a repeated query key', async () => {
      const h = await harness();

      await h.send({
        kind: 'api',
        method: 'GET',
        path: '/api/external/http-data/data-marts/dm-1.ndjson',
        query: [
          ['column', 'Event Date'],
          ['column', 'Revenue'],
          ['limit', '5'],
        ],
      });

      const url = new URL(String(h.fetchMock.mock.calls[0][0]));
      expect(url.searchParams.getAll('column')).toEqual(['Event Date', 'Revenue']);
      expect(url.searchParams.get('limit')).toBe('5');
    });
  });

  describe('credential containment', () => {
    // The property the whole design rests on: the token exists only in the bridge
    // closure, so there is nothing for the plugin to read.
    it('never lets the runtime token cross the frame boundary', async () => {
      const h = await harness();

      await h.send({ kind: 'api', method: 'GET', path: '/api/data-marts' });
      await h.send({ kind: 'api', method: 'POST', path: '/api/data-marts', body: { a: 1 } });

      for (const message of h.posted) {
        expect(JSON.stringify(message.data)).not.toContain(RUNTIME_TOKEN);
      }
    });

    it('attaches the runtime token to the outbound request instead', async () => {
      const h = await harness();

      await h.send({ kind: 'api', method: 'GET', path: '/api/data-marts' });

      const init = h.fetchMock.mock.calls[0][1] as RequestInit;
      expect((init.headers as Record<string, string>)['x-owox-authorization']).toBe(
        `Bearer ${RUNTIME_TOKEN}`
      );
    });

    // Everything else the backend returns is host detail the plugin has no use for, and
    // some of it names internal services.
    it('forwards only allow-listed response headers', async () => {
      const h = await harness(
        async () =>
          new Response('{}', {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'x-owox-run-id': 'run-7',
              'set-cookie': 'session=secret',
              'x-internal-backend': 'db-primary',
            },
          })
      );

      const response = await h.send({ kind: 'api', method: 'GET', path: '/api/x' });

      expect(response).toMatchObject({
        ok: true,
        headers: { 'content-type': 'application/json', 'x-owox-run-id': 'run-7' },
      });
      expect(JSON.stringify(response)).not.toContain('secret');
      expect(JSON.stringify(response)).not.toContain('db-primary');
    });
  });

  describe('handshake', () => {
    it('assigns the frame source only after it is listening', async () => {
      const frame = pluginFrame();
      vi.stubGlobal('fetch', vi.fn());

      expect(frame.iframe.src).toBe('');
      const bridge = createPluginHostBridge({
        iframe: frame.iframe,
        src: 'https://plugin.example.test/',
        apiOrigin: API_ORIGIN,
        context: CONTEXT,
        fetchRuntimeToken: () => Promise.resolve({ runtimeToken: RUNTIME_TOKEN, expiresIn: 900 }),
        onOpenExternal: vi.fn(),
        onNavigate: vi.fn(),
      });

      // A declarative src would already have loaded by now, and a fast plugin's single
      // announcement would have been lost.
      expect(frame.iframe.src).toBe('https://plugin.example.test/');
      bridge.dispose();
    });

    it('ignores an announcement from a window that is not the frame', async () => {
      const frame = pluginFrame();
      vi.stubGlobal('fetch', vi.fn());

      const bridge = createPluginHostBridge({
        iframe: frame.iframe,
        src: 'https://plugin.example.test/',
        apiOrigin: API_ORIGIN,
        context: CONTEXT,
        fetchRuntimeToken: () => Promise.resolve({ runtimeToken: RUNTIME_TOKEN, expiresIn: 900 }),
        onOpenExternal: vi.fn(),
        onNavigate: vi.fn(),
      });

      announceReady({ nowhere: true });
      await flush();

      expect(frame.posted).toHaveLength(0);
      bridge.dispose();
    });

    // Once the channel exists the host stops listening on window, so a plugin cannot
    // smuggle a request in through postMessage afterwards.
    it('stops listening on the window once the channel exists', async () => {
      const h = await harness();

      announceReady(h as unknown as { posted: unknown } as object);
      await flush();

      expect(h.posted).toHaveLength(1);
    });
  });

  /**
   * Closing the port only silences the answer. Teardown has to stop the plugin acting,
   * so a request already on the wire -- carrying the runtime token -- must be aborted.
   */
  describe('teardown', () => {
    const hangingFetch = () => {
      const seen: { signal?: AbortSignal | null } = {};
      const fetchImpl = (_url: string, init: RequestInit) =>
        new Promise<Response>(() => {
          seen.signal = init.signal;
        });

      return { seen, fetchImpl };
    };

    it('aborts a request still in flight when the host unmounts', async () => {
      const { seen, fetchImpl } = hangingFetch();
      const h = await harness(fetchImpl);

      h.tell({ kind: 'api', method: 'GET', path: '/api/data-marts' });
      await flush();
      expect(seen.signal?.aborted).toBe(false);

      h.bridge.dispose();

      expect(seen.signal?.aborted).toBe(true);
      // An unmount already knows the plugin is gone; telling it would re-render a page
      // that is on its way out.
      expect(h.onBroken).not.toHaveBeenCalled();
    });

    // The nonce breach tears the channel down exactly as an unmount does, and a request
    // the plugin got away before failing that check must not outlive it.
    it('aborts a request still in flight when the frame fails the nonce check', async () => {
      const { seen, fetchImpl } = hangingFetch();
      const h = await harness(fetchImpl);

      h.tell({ kind: 'api', method: 'GET', path: '/api/data-marts' });
      await flush();

      h.raw({ owox: 'plugin-hello', v: PLUGIN_PROTOCOL_VERSION, nonce: 'not-the-nonce' });
      await flush();

      expect(seen.signal?.aborted).toBe(true);
    });
  });

  describe('handshake ack', () => {
    const ok = async () =>
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });

    it('serves nothing until the frame echoes the nonce', async () => {
      const h = await harness(ok, false);

      const response = await h.send({ kind: 'api', method: 'GET', path: '/api/data-marts' });

      expect(response).toMatchObject({ ok: false, error: { code: 'PROTOCOL_ERROR' } });
      expect(h.fetchMock).not.toHaveBeenCalled();
    });

    // The port went to this frame and nowhere else, so a wrong nonce is not a race -- it is
    // an end that failed the only check it was given.
    it('closes the channel on a wrong nonce instead of serving it', async () => {
      const h = await harness(ok, false);

      h.raw({ owox: 'plugin-hello', v: PLUGIN_PROTOCOL_VERSION, nonce: 'not-the-nonce' });
      await flush();
      h.tell({ kind: 'api', method: 'GET', path: '/api/data-marts' });
      await flush();

      expect(h.fetchMock).not.toHaveBeenCalled();
      // The frame is now inert. Left painted it reads as a slow plugin rather than a
      // broken one, so the host has to be told.
      expect(h.onBroken).toHaveBeenCalledTimes(1);
    });

    it('serves requests once the nonce matches', async () => {
      const h = await harness(ok);

      const response = await h.send({ kind: 'api', method: 'GET', path: '/api/data-marts' });

      expect(response).toMatchObject({ ok: true });
    });

    // The ack states the version it speaks, and the host reads it against this version's
    // rules. One without a version is not this protocol, and nothing is deployed against
    // an SDK that omits it -- there is nothing to be lenient towards.
    it('refuses an ack that omits the protocol version', async () => {
      const h = await harness(ok, false);

      h.raw({ owox: 'plugin-hello', nonce: h.nonce });
      await flush();
      h.tell({ kind: 'api', method: 'GET', path: '/api/data-marts' });
      await flush();

      expect(h.fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('non-requests on the port', () => {
    // The ack shares this port with real requests, and it is not one. Answering it sent
    // back a FORBIDDEN with no correlation id, which the SDK could only drop.
    it.each([
      ['a payload with no kind', () => ({ id: 'stray' })],
      ['something that is not an object', () => 'hello'],
      // A second ack is redundant, not hostile: same port, same nonce, nothing to answer.
      [
        'a repeated ack',
        (h: Harness) => ({ owox: 'plugin-hello', v: PLUGIN_PROTOCOL_VERSION, nonce: h.nonce }),
      ],
      // An ack from another protocol version fails the guard, so it is not an ack at all.
      [
        'an ack for another protocol version',
        (h: Harness) => ({ owox: 'plugin-hello', v: 99, nonce: h.nonce }),
      ],
    ])('ignores %s rather than answering it', async (_label, payload) => {
      const h = await harness();

      h.raw(payload(h));
      const response = await h.send({
        kind: 'api',
        method: 'GET',
        path: '/api/data-marts',
        id: 'req-1',
      });

      // The first thing back on the port is the answer to the request, not a stray refusal.
      expect(response).toMatchObject({ id: 'req-1', ok: true });
      expect(h.fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('host-mediated capabilities', () => {
    it('hands an external link to the host to validate', async () => {
      const h = await harness();

      h.tell({ kind: 'openExternal', url: 'https://docs.example.test' });
      await flush();

      expect(h.onOpenExternal).toHaveBeenCalledWith('https://docs.example.test');
      expect(h.fetchMock).not.toHaveBeenCalled();
    });

    // A separate kind, not a URL shape: the host answers the two by different rules, so
    // the plugin has to say which it means.
    it('hands an in-app path to the host as its own request', async () => {
      const h = await harness();

      h.tell({ kind: 'navigate', path: '/ui/j1/data-marts/dm-1' });
      await flush();

      expect(h.onNavigate).toHaveBeenCalledWith('/ui/j1/data-marts/dm-1');
      expect(h.onOpenExternal).not.toHaveBeenCalled();
      expect(h.fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('errors', () => {
    it('reports a suspension distinctly, so the plugin can say what happened', async () => {
      const h = await harness(
        async () =>
          new Response(JSON.stringify({ code: 'PLUGIN_SUSPENDED', message: 'unavailable' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          })
      );

      const response = await h.send({ kind: 'api', method: 'GET', path: '/api/data-marts' });

      expect(response).toMatchObject({ ok: false, error: { code: 'SUSPENDED' } });
    });

    it('reports an ordinary failure as an http error', async () => {
      const h = await harness(async () => new Response('{}', { status: 500 }));

      const response = await h.send({ kind: 'api', method: 'GET', path: '/api/x' });

      expect(response).toMatchObject({ ok: false, error: { code: 'HTTP_ERROR', status: 500 } });
    });
  });
});
