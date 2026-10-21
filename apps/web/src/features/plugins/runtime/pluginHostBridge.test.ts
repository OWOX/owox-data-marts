import type { PluginRequest, PluginRequestInput, PluginResponse } from './protocol';
import { PLUGIN_PROTOCOL_VERSION } from './protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FINAL_EXECUTION_STATUSES,
  RuntimeTokenRefused,
  createPluginHostBridge,
  type PluginHostBridge,
} from './pluginHostBridge';
import {
  acceptedAuthenticatedApiPaths,
  rejectedAuthenticatedApiPaths,
} from '../../../../../../test/contracts/authenticated-api-path-contract.mjs';
import { pluginActionFinalStatuses } from '../../../../../../test/contracts/plugin-action-contract.mjs';

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

function announceReady(contentWindow: object, protocolVersion: number = PLUGIN_PROTOCOL_VERSION) {
  const event = new MessageEvent('message', {
    data: { owox: 'plugin-ready', v: protocolVersion },
    origin: 'null',
  });
  Object.defineProperty(event, 'source', { value: contentWindow });
  window.dispatchEvent(event);
}

function announceRaw(contentWindow: object, data: unknown) {
  const event = new MessageEvent('message', { data, origin: 'null' });
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
  fetchRuntimeToken: ReturnType<typeof vi.fn>;
  onOpenExternal: ReturnType<typeof vi.fn>;
  onNavigate: ReturnType<typeof vi.fn>;
  onRouteChange: ReturnType<typeof vi.fn>;
  onCopyLink: ReturnType<typeof vi.fn>;
  onBroken: ReturnType<typeof vi.fn>;
}

async function harness(
  fetchImpl: (url: string, init: RequestInit) => Promise<Response> = async () =>
    new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
  /** Off for the tests that are about the handshake itself rather than what follows it. */
  greet = true,
  protocolVersion: number = PLUGIN_PROTOCOL_VERSION
): Promise<Harness> {
  const frame = pluginFrame();
  const fetchMock = vi.fn(fetchImpl);
  vi.stubGlobal('fetch', fetchMock);

  const onOpenExternal = vi.fn();
  const onNavigate = vi.fn();
  const onRouteChange = vi.fn();
  const onCopyLink = vi.fn(() => Promise.resolve());
  const onBroken = vi.fn();
  const fetchRuntimeToken = vi.fn(() =>
    Promise.resolve({ runtimeToken: RUNTIME_TOKEN, expiresIn: 900 })
  );

  const bridge = createPluginHostBridge({
    iframe: frame.iframe,
    src: 'https://plugin.example.test/',
    apiOrigin: API_ORIGIN,
    context: CONTEXT,
    fetchRuntimeToken,
    onOpenExternal,
    onNavigate,
    onRouteChange,
    onCopyLink,
    onBroken,
  });

  announceReady(frame.contentWindow, protocolVersion);
  await flush();

  const init = frame.posted[0].data as { owox: string; v: number; nonce: string };
  expect(init.owox).toBe('host-init');
  const port = frame.posted[0].transfer?.[0] as MessagePort;

  // What the SDK does the moment it binds the port, and what the host now requires before
  // it will serve anything.
  if (greet) {
    port.start();
    port.postMessage({ owox: 'plugin-hello', v: protocolVersion, nonce: init.nonce });
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
    fetchRuntimeToken,
    onOpenExternal,
    onNavigate,
    onRouteChange,
    onCopyLink,
    onBroken,
  };
}

describe('plugin host bridge', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the v1 request type aligned with additive runtime body rules', () => {
    const valid: PluginRequest[] = [
      { id: 'get', kind: 'api', method: 'GET', path: '/api/x' },
      { id: 'bodyless-post', kind: 'api', method: 'POST', path: '/api/x' },
      { id: 'post', kind: 'api', method: 'POST', path: '/api/x', body: null },
      { id: 'bodyless-put', kind: 'api', method: 'PUT', path: '/api/x' },
      { id: 'put', kind: 'api', method: 'PUT', path: '/api/x', body: {} },
      { id: 'patch', kind: 'api', method: 'PATCH', path: '/api/x', body: [] },
      { id: 'delete', kind: 'api', method: 'DELETE', path: '/api/x' },
      { id: 'stream', kind: 'api', method: 'GET', path: '/api/x', stream: true },
    ];

    // @ts-expect-error PATCH requests require a body property.
    const bodylessPatch: PluginRequest = {
      id: 'bodyless-patch',
      kind: 'api',
      method: 'PATCH',
      path: '/api/x',
    };
    const getWithBody: PluginRequest = {
      id: 'get-with-body',
      kind: 'api',
      method: 'GET',
      path: '/api/x',
      // @ts-expect-error GET requests never carry a body.
      body: {},
    };

    expect(valid).toHaveLength(8);
    expect(bodylessPatch).toBeDefined();
    expect(getWithBody).toBeDefined();
  });

  describe('exfiltration guard', () => {
    /**
     * The highest-severity check in the iteration.
     *
     * `new URL('//evil.example/x', origin)` resolves to `https://evil.example/x`, so a
     * naive string prefix test would let a plugin make the host send the runtime token
     * to an attacker.
     */
    it.each(rejectedAuthenticatedApiPaths)(
      'refuses %s and issues no request at all',
      async (_label, path) => {
        const h = await harness();

        const response = await h.send({ kind: 'api', method: 'GET', path });

        expect(response).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
        expect(h.fetchMock).not.toHaveBeenCalled();
        expect(h.fetchRuntimeToken).not.toHaveBeenCalled();
      }
    );

    it.each(acceptedAuthenticatedApiPaths)('allows %s', async (_label, path) => {
      const h = await harness();

      const response = await h.send({ kind: 'api', method: 'GET', path });

      expect(response).toMatchObject({ ok: true });
      expect(h.fetchRuntimeToken).toHaveBeenCalledTimes(1);
      expect(h.fetchMock).toHaveBeenCalledTimes(1);
    });

    it('refuses an arbitrary method before minting a token', async () => {
      const h = await harness();

      const response = await h.send({
        kind: 'api',
        method: 'OPTIONS',
        path: '/api/data-marts',
      } as unknown as PluginRequestInput);

      expect(response).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
      expect(h.fetchMock).not.toHaveBeenCalled();
      expect(h.fetchRuntimeToken).not.toHaveBeenCalled();
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

  describe('schedule calls', () => {
    const SCHEDULES = '/api/plugins/runtime/schedules';
    const schedulePath = `${SCHEDULES}/${crypto.randomUUID()}`;

    it.each([
      ['list', 'GET', SCHEDULES, undefined],
      ['get', 'GET', schedulePath, undefined],
      ['create', 'POST', SCHEDULES, { action: 'export', cron: '* * * * *', timeZone: 'UTC' }],
      ['update', 'PATCH', schedulePath, { cron: '0 9 * * *' }],
      ['pause', 'POST', `${schedulePath}/pause`, undefined],
      ['resume', 'POST', `${schedulePath}/resume`, undefined],
      ['delete', 'DELETE', schedulePath, undefined],
    ] as const)(
      'sends %s to its runtime path with the runtime token',
      async (_name, method, path, body) => {
        const h = await harness();

        const response = await h.send({
          kind: 'api',
          method,
          path,
          ...(body ? { body } : {}),
        } as PluginRequestInput);

        expect(response).toMatchObject({ ok: true });
        const [url, init] = h.fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(`${API_ORIGIN}${path}`);
        expect(init.method).toBe(method);
        expect((init.headers as Record<string, string>)['x-owox-authorization']).toBe(
          `Bearer ${RUNTIME_TOKEN}`
        );
        expect(init.body).toBe(body ? JSON.stringify(body) : undefined);
      }
    );

    it('answers a refusal with the HTTP status and the API code', async () => {
      const h = await harness(async () =>
        Response.json({ code: 'SCHEDULE_NOT_FOUND', message: 'No such schedule' }, { status: 404 })
      );

      const response = await h.send({ kind: 'api', method: 'GET', path: schedulePath });

      expect(response).toMatchObject({
        ok: false,
        error: {
          code: 'HTTP_ERROR',
          status: 404,
          apiCode: 'SCHEDULE_NOT_FOUND',
          message: 'No such schedule',
        },
      });
    });

    it.each([
      ['a slash', 'a/b'],
      ['a percent sign', '100%'],
      ['a backslash', 'a\\b'],
    ])('refuses an id with %s without a network call', async (_label, id) => {
      const h = await harness();

      const response = await h.send({
        kind: 'api',
        method: 'GET',
        path: `${SCHEDULES}/${encodeURIComponent(id)}`,
      });

      expect(response).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
      expect(h.fetchMock).not.toHaveBeenCalled();
      expect(h.fetchRuntimeToken).not.toHaveBeenCalled();
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

    it('forwards credentialFetch only to the installation-bound backend operation', async () => {
      const h = await harness(async () =>
        Response.json({
          status: 200,
          headers: { 'content-type': 'application/json' },
          bodyBase64: btoa('{"ok":true}'),
        })
      );

      const response = await h.send({
        kind: 'credentialFetch',
        version: 1,
        handle: 'github',
        url: 'https://api.github.com/user',
        method: 'GET',
      });

      expect(response).toMatchObject({
        ok: true,
        body: { status: 200, bodyBase64: expect.any(String) },
      });
      expect(h.fetchMock.mock.calls[0][0]).toBe(
        `${API_ORIGIN}/api/plugins/runtime/credentials/github/fetch`
      );
      const init = h.fetchMock.mock.calls[0][1] as RequestInit;
      expect(init.headers).toMatchObject({
        'x-owox-authorization': `Bearer ${RUNTIME_TOKEN}`,
      });
      expect(JSON.stringify(response)).not.toContain(RUNTIME_TOKEN);
    });

    it('rejects malformed credentialFetch before minting a runtime token', async () => {
      const h = await harness();
      const response = await h.send({
        kind: 'credentialFetch',
        version: 2,
        handle: 'github',
        url: 'http://169.254.169.254/latest/meta-data',
        method: 'GET',
      } as unknown as PluginRequestInput);

      expect(response).toMatchObject({ ok: false, error: { code: 'PROTOCOL_ERROR' } });
      expect(h.fetchMock).not.toHaveBeenCalled();
      expect(h.fetchRuntimeToken).not.toHaveBeenCalled();
    });

    it.each(['bad name', 'bad:name'])('rejects invalid Credential header name %s', async name => {
      const h = await harness();
      const response = await h.send({
        kind: 'credentialFetch',
        version: 1,
        handle: 'github',
        url: 'https://api.github.com/user',
        method: 'GET',
        headers: { [name]: 'value' },
      });

      expect(response).toMatchObject({ ok: false, error: { code: 'PROTOCOL_ERROR' } });
      expect(h.fetchMock).not.toHaveBeenCalled();
      expect(h.fetchRuntimeToken).not.toHaveBeenCalled();
    });

    it('forwards custom Fetch-compatible provider methods', async () => {
      const h = await harness(async () =>
        Response.json({ status: 204, headers: {}, bodyBase64: '' })
      );

      await h.send({
        kind: 'credentialFetch',
        version: 1,
        handle: 'github',
        url: 'https://api.github.com/resource',
        method: 'PROPFIND',
      });

      const body = (h.fetchMock.mock.calls[0][1] as RequestInit).body;
      expect(typeof body).toBe('string');
      if (typeof body !== 'string') throw new TypeError('Expected a JSON request body');
      expect(JSON.parse(body)).toMatchObject({ method: 'PROPFIND' });
    });

    it('forwards logical AI generation only to the installation-bound backend adapter', async () => {
      const h = await harness(async () =>
        Response.json({
          content: [{ type: 'text', text: 'hello' }],
          finishReason: { unified: 'stop' },
          usage: {},
          warnings: [],
        })
      );

      const response = await h.send({
        kind: 'credentialAi',
        version: 1,
        handle: 'ai',
        operation: 'generate',
        model: 'fast',
        options: { prompt: [] },
      });

      expect(response).toMatchObject({ ok: true, body: { content: [{ text: 'hello' }] } });
      expect(h.fetchMock.mock.calls[0][0]).toBe(
        `${API_ORIGIN}/api/plugins/runtime/credentials/ai/ai/generate`
      );
      expect(h.fetchMock.mock.calls[0][1]).toMatchObject({
        method: 'POST',
        redirect: 'error',
        headers: expect.objectContaining({
          'x-owox-authorization': `Bearer ${RUNTIME_TOKEN}`,
        }),
      });
    });

    it('keeps logical AI stream chunks transferable', async () => {
      const h = await harness(
        async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new TextEncoder().encode('{"type":"text-delta"}\n'));
                controller.close();
              },
            }),
            { headers: { 'content-type': 'application/x-ndjson' } }
          )
      );

      const response = await h.send({
        kind: 'credentialAi',
        version: 1,
        handle: 'ai',
        operation: 'stream',
        model: 'reasoning',
        options: { prompt: [] },
        stream: true,
      });

      expect(response).toMatchObject({ ok: true, status: 200 });
      expect('stream' in response ? await new Response(response.stream).text() : '').toBe(
        '{"type":"text-delta"}\n'
      );
    });

    it('rejects mismatched logical AI operations before minting a runtime token', async () => {
      const h = await harness();

      const response = await h.send({
        kind: 'credentialAi',
        version: 1,
        handle: 'ai',
        operation: 'embed',
        model: 'fast',
        options: { values: ['hello'] },
      } as unknown as PluginRequestInput);

      expect(response).toMatchObject({ ok: false, error: { code: 'PROTOCOL_ERROR' } });
      expect(h.fetchMock).not.toHaveBeenCalled();
      expect(h.fetchRuntimeToken).not.toHaveBeenCalled();
    });

    it('forbids fetch redirects so the runtime token cannot follow a cross-origin location', async () => {
      const h = await harness(
        async () =>
          new Response(null, {
            status: 302,
            headers: { location: 'https://attacker.test/collect' },
          })
      );

      const response = await h.send({ kind: 'api', method: 'GET', path: '/api/data-marts' });

      expect(response).toMatchObject({ ok: false, error: { code: 'HTTP_ERROR', status: 302 } });
      expect(h.fetchMock).toHaveBeenCalledTimes(1);
      expect(h.fetchMock.mock.calls[0][0]).toBe(`${API_ORIGIN}/api/data-marts`);
      expect(h.fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
    });

    it('answers SUSPENDED when the token mint is refused for a suspended plugin', async () => {
      const h = await harness(async () => new Response('{}'));
      h.fetchRuntimeToken.mockRejectedValueOnce(
        new RuntimeTokenRefused(400, { code: 'PLUGIN_SUSPENDED', message: 'Plugin is suspended' })
      );

      const response = await h.send({ kind: 'api', method: 'GET', path: '/api/data-marts' });

      expect(response).toMatchObject({
        ok: false,
        error: {
          code: 'SUSPENDED',
          status: 400,
          message: 'Plugin is suspended',
          apiCode: 'PLUGIN_SUSPENDED',
        },
      });
    });

    it('keeps NETWORK_ERROR when the token mint fails for any other reason', async () => {
      const h = await harness(async () => new Response('{}'));
      h.fetchRuntimeToken.mockRejectedValueOnce(new Error('offline'));

      const response = await h.send({ kind: 'api', method: 'GET', path: '/api/data-marts' });

      expect(response).toMatchObject({ ok: false, error: { code: 'NETWORK_ERROR' } });
    });

    it('does not echo credentials from an unexpected network error to the plugin', async () => {
      const h = await harness(async () => {
        throw new Error(`request failed with Bearer ${RUNTIME_TOKEN}`);
      });

      const response = await h.send({ kind: 'api', method: 'GET', path: '/api/data-marts' });

      expect(response).toMatchObject({ ok: false, error: { code: 'NETWORK_ERROR' } });
      expect(JSON.stringify(response)).not.toContain(RUNTIME_TOKEN);
    });

    it('ignores plugin-supplied header-shaped fields and builds authentication itself', async () => {
      const h = await harness();

      await h.send({
        kind: 'api',
        method: 'GET',
        path: '/api/data-marts',
        headers: {
          authorization: 'Bearer attacker-token',
          'x-owox-authorization': 'Bearer attacker-runtime-token',
        },
        authorization: 'Bearer attacker-token',
        fetchInit: { credentials: 'include' },
      } as unknown as PluginRequestInput);

      const init = h.fetchMock.mock.calls[0][1] as RequestInit;
      expect(init.headers).toEqual({
        'x-owox-authorization': `Bearer ${RUNTIME_TOKEN}`,
      });
      expect(init.credentials).toBeUndefined();
      expect(JSON.stringify(init)).not.toContain('attacker-token');
      expect(JSON.stringify(init)).not.toContain('attacker-runtime-token');
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
    it('advertises the compatible protocol v1', async () => {
      const h = await harness();

      expect(PLUGIN_PROTOCOL_VERSION).toBe(1);
      expect(h.posted[0].data).toMatchObject({ owox: 'host-init', v: 1 });
    });

    it('negotiates protocol v1 and serves requests after a matching v1 hello', async () => {
      const h = await harness(undefined, true, 1);

      expect(h.posted[0].data).toMatchObject({ owox: 'host-init', v: 1 });
      await expect(
        h.send({ kind: 'api', method: 'GET', path: '/api/data-marts' })
      ).resolves.toMatchObject({ ok: true });
    });

    it.each([
      ['v0', { owox: 'plugin-ready', v: 0 }],
      ['v2', { owox: 'plugin-ready', v: 2 }],
      ['v3', { owox: 'plugin-ready', v: 3 }],
      ['a string version', { owox: 'plugin-ready', v: '2' }],
      ['a missing version', { owox: 'plugin-ready' }],
      ['a malformed envelope', { owox: 'plugin-ready', v: null }],
    ])('ignores unsupported ready announcement %s without side effects', async (_label, data) => {
      const frame = pluginFrame();
      const fetchMock = vi.fn();
      const fetchRuntimeToken = vi.fn(() =>
        Promise.resolve({ runtimeToken: RUNTIME_TOKEN, expiresIn: 900 })
      );
      vi.stubGlobal('fetch', fetchMock);

      const bridge = createPluginHostBridge({
        iframe: frame.iframe,
        src: 'https://plugin.example.test/',
        apiOrigin: API_ORIGIN,
        context: CONTEXT,
        fetchRuntimeToken,
        onOpenExternal: vi.fn(),
        onNavigate: vi.fn(),
        onRouteChange: vi.fn(),
        onCopyLink: vi.fn(),
      });

      announceRaw(frame.contentWindow, data);
      await flush();

      expect(frame.posted).toHaveLength(0);
      expect(fetchRuntimeToken).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      bridge.dispose();
    });

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
        onRouteChange: vi.fn(),
        onCopyLink: vi.fn(),
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
        onRouteChange: vi.fn(),
        onCopyLink: vi.fn(),
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

    describe('executions started by invoke', () => {
      const START_PATH = '/api/plugins/runtime/actions/sync/executions';
      const CANCEL_URL = `${API_ORIGIN}/api/plugins/runtime/executions/e1/cancel`;

      /** A backend that starts execution e1 and reports `pollStatus` when asked about it. */
      const backend =
        (pollStatus = 'RUNNING', startStatus = 202) =>
        async (url: string, init: RequestInit) => {
          if (url.endsWith('/cancel')) return Response.json({ id: 'e1', status: 'CANCELLED' });
          if (init.method === 'POST') {
            return Response.json({ id: 'e1', status: 'RUNNING' }, { status: startStatus });
          }
          return Response.json({ id: 'e1', status: pollStatus });
        };

      const cancelCalls = (h: Harness) =>
        h.fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/cancel'));

      it('cancels them when the host unmounts, with a request that outlives the page', async () => {
        const h = await harness(backend());

        await h.send({
          kind: 'api',
          method: 'POST',
          path: START_PATH,
          body: { input: null },
          cancelOnClose: true,
        });
        h.bridge.dispose();

        const calls = cancelCalls(h);
        expect(calls).toHaveLength(1);
        expect(calls[0][0]).toBe(CANCEL_URL);
        const init = calls[0][1] as RequestInit;
        expect(init).toMatchObject({ method: 'POST', keepalive: true, redirect: 'error' });
        expect(init.headers).toEqual({ 'x-owox-authorization': `Bearer ${RUNTIME_TOKEN}` });
        // The teardown signal is already aborted; a cancel tied to it would never leave.
        expect(init.signal).toBeUndefined();
      });

      it('leaves an execution from start running', async () => {
        const h = await harness(backend());

        await h.send({ kind: 'api', method: 'POST', path: START_PATH, body: { input: null } });
        h.bridge.dispose();

        expect(cancelCalls(h)).toHaveLength(0);
      });

      it.each([
        ['a path that is not a start', `${START_PATH}/more`, 202],
        ['a start that was not accepted', START_PATH, 200],
      ])('does not track %s', async (_case, path, startStatus) => {
        const h = await harness(backend('RUNNING', startStatus));

        await h.send({
          kind: 'api',
          method: 'POST',
          path,
          body: { input: null },
          cancelOnClose: true,
        });
        h.bridge.dispose();

        expect(cancelCalls(h)).toHaveLength(0);
      });

      // OWOX and the SDK keep their own copies; each suite compares its copy with the oracle.
      it('treats the same statuses as final as OWOX and the SDK', () => {
        expect([...FINAL_EXECUTION_STATUSES].sort()).toEqual([...pluginActionFinalStatuses].sort());
      });

      it('forgets an execution once a poll reports it finished', async () => {
        const h = await harness(backend('SUCCEEDED'));

        await h.send({
          kind: 'api',
          method: 'POST',
          path: START_PATH,
          body: { input: null },
          cancelOnClose: true,
        });
        await h.send({
          kind: 'api',
          method: 'GET',
          path: '/api/plugins/runtime/executions/e1',
          query: [['waitSeconds', '20']],
        });
        h.bridge.dispose();

        expect(cancelCalls(h)).toHaveLength(0);
      });

      it('keeps an execution a poll reports still running', async () => {
        const h = await harness(backend('RUNNING'));

        await h.send({
          kind: 'api',
          method: 'POST',
          path: START_PATH,
          body: { input: null },
          cancelOnClose: true,
        });
        await h.send({ kind: 'api', method: 'GET', path: '/api/plugins/runtime/executions/e1' });
        h.bridge.dispose();

        expect(cancelCalls(h)).toHaveLength(1);
      });

      // Minting is async and would outlive the closure; the execution ends at its deadline.
      it('sends no cancel once the token has expired', async () => {
        const h = await harness(backend());

        await h.send({
          kind: 'api',
          method: 'POST',
          path: START_PATH,
          body: { input: null },
          cancelOnClose: true,
        });
        const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 901_000);
        try {
          h.bridge.dispose();
        } finally {
          now.mockRestore();
        }

        expect(cancelCalls(h)).toHaveLength(0);
        expect(h.fetchRuntimeToken).toHaveBeenCalledTimes(1);
      });

      describe('a start that answers after the plugin let go of it', () => {
        const invokeStart = (id: string) => ({
          id,
          kind: 'api' as const,
          method: 'POST' as const,
          path: START_PATH,
          body: { input: null },
          cancelOnClose: true as const,
        });

        /** The server answers the start when told to; like the browser's, it rejects on abort. */
        const pendingStart = () => {
          let accept: (() => void) | undefined;
          const fetchImpl = (url: string, init: RequestInit) => {
            if (url.endsWith('/cancel')) {
              return Promise.resolve(Response.json({ id: 'e1', status: 'CANCELLED' }));
            }
            return new Promise<Response>((resolve, reject) => {
              init.signal?.addEventListener('abort', () => {
                reject(new DOMException('The request was aborted', 'AbortError'));
              });
              accept = () => {
                resolve(Response.json({ id: 'e1', status: 'RUNNING' }, { status: 202 }));
              };
            });
          };
          return {
            fetchImpl,
            accept: () => {
              accept?.();
            },
          };
        };

        const startOnTheWire = async () => {
          const start = pendingStart();
          const h = await harness(start.fetchImpl);
          h.raw(invokeStart('start-1'));
          await vi.waitFor(() => {
            expect(h.fetchMock).toHaveBeenCalledTimes(1);
          });
          return { h, accept: start.accept };
        };

        it('cancels it with the kept token once the host has unmounted', async () => {
          const { h, accept } = await startOnTheWire();

          h.bridge.dispose();
          accept();

          await vi.waitFor(() => {
            expect(cancelCalls(h)).toHaveLength(1);
          });
          const [url, init] = cancelCalls(h)[0] as [string, RequestInit];
          expect(url).toBe(CANCEL_URL);
          expect(init).toMatchObject({ method: 'POST', keepalive: true, redirect: 'error' });
          expect(init.headers).toEqual({ 'x-owox-authorization': `Bearer ${RUNTIME_TOKEN}` });
        });

        it('cancels it once the SDK has given up on the start', async () => {
          const { h, accept } = await startOnTheWire();

          h.raw({ id: 'cancel-1', kind: 'cancel', targetId: 'start-1' });
          await flush();
          accept();

          await vi.waitFor(() => {
            expect(cancelCalls(h)).toHaveLength(1);
          });
          expect(cancelCalls(h)[0][0]).toBe(CANCEL_URL);
          // Cancelled, not tracked as well: the unmount has nothing left to cancel.
          h.bridge.dispose();
          expect(cancelCalls(h)).toHaveLength(1);
        });

        it('sends no cancel once the kept token has expired', async () => {
          const { h, accept } = await startOnTheWire();

          h.bridge.dispose();
          const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 901_000);
          try {
            accept();
            await flush();
            await flush();
          } finally {
            now.mockRestore();
          }

          expect(cancelCalls(h)).toHaveLength(0);
        });

        it('cancels a tracked start at once when the SDK gives up after its answer', async () => {
          const h = await harness(backend());

          await h.send(invokeStart('start-1'));
          h.raw({ id: 'cancel-1', kind: 'cancel', targetId: 'start-1' });

          await vi.waitFor(() => {
            expect(cancelCalls(h)).toHaveLength(1);
          });
          expect(cancelCalls(h)[0][0]).toBe(CANCEL_URL);
          // Untracked once cancelled: the unmount sends no second one.
          h.bridge.dispose();
          expect(cancelCalls(h)).toHaveLength(1);
        });

        it('mints a fresh token when the live one expired before the start answered', async () => {
          const { h, accept } = await startOnTheWire();
          h.fetchRuntimeToken.mockResolvedValueOnce({
            runtimeToken: 'fresh-token',
            expiresIn: 900,
          });

          h.raw({ id: 'cancel-1', kind: 'cancel', targetId: 'start-1' });
          await flush();
          const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 901_000);
          try {
            accept();
            await flush();
            await flush();
          } finally {
            now.mockRestore();
          }

          expect(cancelCalls(h)).toHaveLength(1);
          const init = cancelCalls(h)[0][1] as RequestInit;
          expect(init.headers).toEqual({ 'x-owox-authorization': 'Bearer fresh-token' });
        });

        it('leaves the execution for the unmount when that mint fails', async () => {
          const { h, accept } = await startOnTheWire();
          h.fetchRuntimeToken.mockRejectedValueOnce(new Error('offline'));

          h.raw({ id: 'cancel-1', kind: 'cancel', targetId: 'start-1' });
          await flush();
          const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 901_000);
          try {
            accept();
            await flush();
            await flush();
          } finally {
            now.mockRestore();
          }
          expect(cancelCalls(h)).toHaveLength(0);

          h.bridge.dispose();
          expect(cancelCalls(h)).toHaveLength(1);
        });

        describe('a cancel for a tracked start that has to mint', () => {
          interface Minted {
            runtimeToken: string;
            expiresIn: number;
          }
          const FRESH: Minted = { runtimeToken: 'fresh-token', expiresIn: 900 };

          // A tracked start whose live token has expired; every later mint waits for the test.
          const trackedStart = async () => {
            const h = await harness(backend());
            await h.send(invokeStart('start-1'));
            let mint!: { resolve: (minted: Minted) => void; reject: (reason: Error) => void };
            h.fetchRuntimeToken.mockReturnValue(
              new Promise<Minted>((resolve, reject) => {
                mint = { resolve, reject };
              })
            );
            const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 901_000);
            const cancel = (id: string) => {
              h.raw({ id, kind: 'cancel', targetId: 'start-1' });
            };
            // Port delivery is ordered, so this answer means every earlier message was handled.
            const handled = () => h.send({ kind: 'copyLink' });
            return { h, mint, now, cancel, handled };
          };

          it('mints once for a flood of cancels', async () => {
            const { h, mint, now, cancel, handled } = await trackedStart();
            try {
              for (let index = 0; index < 200; index += 1) cancel(`cancel-${String(index)}`);
              await handled();
              expect(h.fetchRuntimeToken).toHaveBeenCalledTimes(2);

              mint.resolve(FRESH);
              await flush();
              expect(cancelCalls(h)).toHaveLength(1);
            } finally {
              now.mockRestore();
            }
          });

          it('puts the execution back when the mint fails, so the unmount cancels it', async () => {
            const { h, mint, now, cancel, handled } = await trackedStart();
            try {
              cancel('cancel-1');
              await handled();
              mint.reject(new Error('offline'));
              await flush();
              expect(cancelCalls(h)).toHaveLength(0);
            } finally {
              now.mockRestore();
            }

            h.bridge.dispose();
            expect(cancelCalls(h)).toHaveLength(1);
          });

          it('sends one cancel when the host unmounts during a mint that succeeds', async () => {
            const { h, mint, now, cancel, handled } = await trackedStart();
            try {
              cancel('cancel-1');
              await handled();
              h.bridge.dispose();
              mint.resolve(FRESH);
              await flush();

              expect(cancelCalls(h)).toHaveLength(1);
              const init = cancelCalls(h)[0][1] as RequestInit;
              expect(init.headers).toEqual({ 'x-owox-authorization': 'Bearer fresh-token' });
            } finally {
              now.mockRestore();
            }
          });

          it('sends nothing when the host unmounts during a mint that fails', async () => {
            const { h, mint, now, cancel, handled } = await trackedStart();
            try {
              cancel('cancel-1');
              await handled();
              h.bridge.dispose();
              mint.reject(new Error('offline'));
              await flush();

              expect(cancelCalls(h)).toHaveLength(0);
            } finally {
              now.mockRestore();
            }
          });
        });

        it.each([
          [
            'the host unmounted',
            (h: Harness) => {
              h.bridge.dispose();
            },
          ],
          [
            'the SDK gave up',
            (h: Harness) => {
              h.raw({ id: 'cancel-1', kind: 'cancel', targetId: 'start-1' });
            },
          ],
        ])('never sends a start that had not left when %s', async (_case, letGo) => {
          const h = await harness(backend());
          let mint: ((minted: { runtimeToken: string; expiresIn: number }) => void) | undefined;
          h.fetchRuntimeToken.mockReturnValueOnce(
            new Promise(resolve => {
              mint = resolve;
            })
          );

          h.raw(invokeStart('start-1'));
          await flush();
          letGo(h);
          await flush();
          mint?.({ runtimeToken: RUNTIME_TOKEN, expiresIn: 900 });
          await flush();

          expect(h.fetchMock).not.toHaveBeenCalled();
          h.bridge.dispose();
        });

        it('still aborts a start without the mark when the host unmounts', async () => {
          const { seen, fetchImpl } = hangingFetch();
          const h = await harness(fetchImpl);

          h.tell({ kind: 'api', method: 'POST', path: START_PATH, body: { input: null } });
          await vi.waitFor(() => {
            expect(seen.signal).toBeDefined();
          });
          h.bridge.dispose();

          expect(seen.signal?.aborted).toBe(true);
        });
      });
    });

    it('aborts the backend Credential request when the SDK cancels its correlation id', async () => {
      const { seen, fetchImpl } = hangingFetch();
      const h = await harness(fetchImpl);

      h.raw({
        id: 'credential-request-1',
        kind: 'credentialFetch',
        version: 1,
        handle: 'github',
        url: 'https://api.github.com/user',
        method: 'GET',
      });
      await vi.waitFor(() => {
        expect(seen.signal).toBeDefined();
      });
      expect(seen.signal?.aborted).toBe(false);

      h.raw({ id: 'cancel-1', kind: 'cancel', targetId: 'credential-request-1' });
      await vi.waitFor(() => {
        expect(seen.signal?.aborted).toBe(true);
      });
      h.bridge.dispose();
    });

    it('keeps a streamed request cancellable after transferring its response', async () => {
      const upstreamCancelled = vi.fn();
      const h = await harness(
        async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              cancel: upstreamCancelled,
            }),
            { status: 200, headers: { 'content-type': 'application/x-ndjson' } }
          )
      );

      const response = await h.send({
        id: 'stream-request-1',
        kind: 'api',
        method: 'GET',
        path: '/api/data.ndjson',
        stream: true,
      });
      expect(response).toMatchObject({ ok: true });

      h.raw({ id: 'cancel-stream-1', kind: 'cancel', targetId: 'stream-request-1' });
      await vi.waitFor(() => {
        expect(upstreamCancelled).toHaveBeenCalled();
      });
      h.bridge.dispose();
    });

    it('keeps transferred never-ending streams inside the 32-request admission limit', async () => {
      const h = await harness(
        async () =>
          new Response(new ReadableStream<Uint8Array>(), {
            status: 200,
            headers: { 'content-type': 'application/x-ndjson' },
          })
      );

      for (let index = 0; index < 32; index += 1) {
        await expect(
          h.send({
            id: `stream-${String(index)}`,
            kind: 'api',
            method: 'GET',
            path: `/api/stream/${String(index)}`,
            stream: true,
          })
        ).resolves.toMatchObject({ ok: true });
      }

      await expect(
        h.send({ kind: 'api', method: 'GET', path: '/api/stream/blocked' })
      ).resolves.toMatchObject({
        ok: false,
        error: { code: 'PROTOCOL_ERROR', message: 'Too many requests in flight' },
      });
      expect(h.fetchMock).toHaveBeenCalledTimes(32);

      h.bridge.dispose();
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

    it('applies the 32-request admission limit before validation and aborts all admitted work', async () => {
      const signals: AbortSignal[] = [];
      const h = await harness(
        (_url, init) =>
          new Promise<Response>(() => {
            if (init.signal) {
              signals.push(init.signal);
            }
          })
      );

      for (let index = 0; index < 32; index += 1) {
        h.tell({ kind: 'api', method: 'GET', path: `/api/data-marts/${String(index)}` });
      }
      await vi.waitFor(() => {
        expect(signals).toHaveLength(32);
      });
      const tokenMintsAtCapacity = h.fetchRuntimeToken.mock.calls.length;

      const response = await h.send({
        kind: 'api',
        method: 'PATCH',
        path: '/api/data-marts/blocked',
        body: 1n,
      });

      expect(response).toMatchObject({
        ok: false,
        error: { code: 'PROTOCOL_ERROR', message: 'Too many requests in flight' },
      });
      expect(h.fetchMock).toHaveBeenCalledTimes(32);
      expect(h.fetchRuntimeToken).toHaveBeenCalledTimes(tokenMintsAtCapacity);

      h.bridge.dispose();
      expect(signals.every(signal => signal.aborted)).toBe(true);
    });

    it('keeps fire-and-forget navigation available while API admission is full', async () => {
      const h = await harness(() => new Promise<Response>(() => undefined));

      for (let index = 0; index < 32; index += 1) {
        h.tell({ kind: 'api', method: 'GET', path: `/api/data-marts/${String(index)}` });
      }
      await vi.waitFor(() => {
        expect(h.fetchMock).toHaveBeenCalledTimes(32);
      });

      h.tell({ kind: 'navigate', path: '/ui/j1/data-marts/dm-1' });
      await flush();

      expect(h.onNavigate).toHaveBeenCalledWith('/ui/j1/data-marts/dm-1');
      expect(h.fetchMock).toHaveBeenCalledTimes(32);
      h.bridge.dispose();
    });

    it('keeps route reports available while API admission is full', async () => {
      const h = await harness(() => new Promise<Response>(() => undefined));

      for (let index = 0; index < 32; index += 1) {
        h.tell({ kind: 'api', method: 'GET', path: `/api/data-marts/${String(index)}` });
      }
      await vi.waitFor(() => {
        expect(h.fetchMock).toHaveBeenCalledTimes(32);
      });

      h.tell({ kind: 'route', path: '/d/1' });
      await flush();

      expect(h.onRouteChange).toHaveBeenCalledWith('/d/1');
      expect(h.fetchMock).toHaveBeenCalledTimes(32);
      h.bridge.dispose();
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

    it('closes the channel when hello does not echo the negotiated version', async () => {
      const h = await harness(ok, false, 1);

      h.raw({ owox: 'plugin-hello', v: 2, nonce: h.nonce });
      await flush();
      h.tell({ kind: 'api', method: 'GET', path: '/api/data-marts' });
      await flush();

      expect(h.fetchMock).not.toHaveBeenCalled();
      expect(h.onBroken).toHaveBeenCalledTimes(1);
    });
  });

  describe('non-requests on the port', () => {
    // The ack shares this port with real requests, and it is not one. Answering it sent
    // back a FORBIDDEN with no correlation id, which the SDK could only drop.
    it.each([
      ['something that is not an object', () => 'hello'],
      // A second ack is redundant, not hostile: same port, same nonce, nothing to answer.
      [
        'a repeated ack',
        (h: Harness) => ({ owox: 'plugin-hello', v: PLUGIN_PROTOCOL_VERSION, nonce: h.nonce }),
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

  describe('request validation', () => {
    it.each([
      ['a missing kind', { id: 'malformed-1' }],
      ['an unknown kind', { id: 'malformed-2', kind: 'rawRequest' }],
      ['a missing path', { id: 'malformed-3', kind: 'api', method: 'GET' }],
      ['a non-string path', { id: 'malformed-4', kind: 'api', method: 'GET', path: 7 }],
      ['a non-string method', { id: 'malformed-10', kind: 'api', method: null, path: '/api/x' }],
      [
        'a non-array query',
        { id: 'malformed-5', kind: 'api', method: 'GET', path: '/api/x', query: { a: 'b' } },
      ],
      [
        'a query pair with a non-string value',
        { id: 'malformed-6', kind: 'api', method: 'GET', path: '/api/x', query: [['a', 1]] },
      ],
      [
        'a non-GET stream request',
        { id: 'malformed-7', kind: 'api', method: 'POST', path: '/api/x', stream: true },
      ],
      ['a GET body', { id: 'malformed-14', kind: 'api', method: 'GET', path: '/api/x', body: {} }],
      [
        'a streaming GET body',
        {
          id: 'malformed-15',
          kind: 'api',
          method: 'GET',
          path: '/api/x',
          stream: true,
          body: {},
        },
      ],
      [
        'an accept value on a streaming GET',
        {
          id: 'malformed-16',
          kind: 'api',
          method: 'GET',
          path: '/api/x',
          stream: true,
          accept: 'application/json',
        },
      ],
      [
        'a non-string accept value',
        { id: 'malformed-11', kind: 'api', method: 'GET', path: '/api/x', accept: 7 },
      ],
      [
        'an invalid accept header value',
        {
          id: 'malformed-17',
          kind: 'api',
          method: 'POST',
          path: '/api/x',
          accept: 'application/json\r\nx-owox-authorization: attacker',
        },
      ],
      [
        'a DELETE body',
        { id: 'malformed-12', kind: 'api', method: 'DELETE', path: '/api/x', body: {} },
      ],
      [
        'a PATCH without a JSON body',
        { id: 'malformed-20', kind: 'api', method: 'PATCH', path: '/api/x' },
      ],
      [
        'a non-JSON body',
        { id: 'malformed-13', kind: 'api', method: 'PATCH', path: '/api/x', body: 1n },
      ],
      ['a malformed navigation', { id: 'malformed-8', kind: 'navigate', path: 7 }],
      ['a malformed external link', { id: 'malformed-9', kind: 'openExternal', url: null }],
    ])('answers %s with PROTOCOL_ERROR before side effects', async (_label, request) => {
      const h = await harness();

      const response = await h.send(request as unknown as PluginRequestInput & { id: string });

      expect(response).toMatchObject({
        id: request.id,
        ok: false,
        error: { code: 'PROTOCOL_ERROR' },
      });
      expect(h.fetchRuntimeToken).not.toHaveBeenCalled();
      expect(h.fetchMock).not.toHaveBeenCalled();
      expect(h.onOpenExternal).not.toHaveBeenCalled();
      expect(h.onNavigate).not.toHaveBeenCalled();
    });
  });

  describe('API methods', () => {
    it.each(['POST', 'PUT'] as const)(
      'forwards a bodyless v1 %s request without minting a content type',
      async method => {
        const h = await harness(undefined, true, 1);

        const response = await h.send({
          kind: 'api',
          method,
          path: '/api/plugin-installations/install',
        } as unknown as PluginRequestInput);

        expect(response).toMatchObject({ ok: true });
        expect(h.fetchRuntimeToken).toHaveBeenCalledTimes(1);
        expect(h.fetchMock).toHaveBeenCalledTimes(1);
        expect(h.fetchMock.mock.calls[0][1]).toMatchObject({ method });
        expect((h.fetchMock.mock.calls[0][1] as RequestInit).body).toBeUndefined();
        expect(
          ((h.fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>)[
            'content-type'
          ]
        ).toBeUndefined();
      }
    );

    it('forwards a v1 PATCH with its JSON body', async () => {
      const h = await harness();

      const response = await h.send({
        kind: 'api',
        method: 'PATCH',
        path: '/api/data-marts/dm-1',
        body: { title: 'Updated' },
      });

      expect(response).toMatchObject({ ok: true });
      expect(h.fetchMock.mock.calls[0][1]).toMatchObject({
        method: 'PATCH',
        body: JSON.stringify({ title: 'Updated' }),
        headers: {
          'content-type': 'application/json',
          'x-owox-authorization': `Bearer ${RUNTIME_TOKEN}`,
        },
      });
    });

    it('forwards a v1 DELETE without a request body and returns ordinary JSON', async () => {
      const h = await harness(async () =>
        Response.json({ deleted: true }, { status: 200, headers: { 'x-owox-run-id': 'run-1' } })
      );

      const response = await h.send({
        kind: 'api',
        method: 'DELETE',
        path: '/api/data-marts/dm-1',
      });

      expect(response).toMatchObject({ ok: true, status: 200, body: { deleted: true } });
      expect(h.fetchMock.mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
      expect((h.fetchMock.mock.calls[0][1] as RequestInit).body).toBeUndefined();
    });

    it('returns undefined for an empty successful DELETE response', async () => {
      const h = await harness(async () => new Response(null, { status: 204 }));

      const response = await h.send({
        kind: 'api',
        method: 'DELETE',
        path: '/api/data-marts/dm-1',
      });

      expect(response).toMatchObject({ ok: true, status: 204, body: undefined });
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

    it('hands a valid route to the host and answers nothing', async () => {
      const h = await harness();

      h.tell({ kind: 'route', path: '/d/42?tab=2' });
      await flush();

      expect(h.onRouteChange).toHaveBeenCalledWith('/d/42?tab=2');
      expect(h.onNavigate).not.toHaveBeenCalled();
      expect(h.fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      '//external.example',
      '/../../settings',
      '/a/./b',
      '/%2e%2e/x',
      '/.%2E/x',
      '/foo\\bar',
      '/foo%5cbar',
      '/a\u0000b',
      `/${'a'.repeat(2048)}`,
    ])('refuses the route %j without touching the address', async path => {
      const h = await harness();

      const response = await h.send({ kind: 'route', path });

      expect(response).toMatchObject({
        ok: false,
        error: { code: 'PROTOCOL_ERROR', message: 'The plugin route is invalid' },
      });
      expect(h.onRouteChange).not.toHaveBeenCalled();
    });

    it('copies a link through the host and answers ok', async () => {
      const h = await harness();

      const response = await h.send({ kind: 'copyLink', path: '/d/42' });

      expect(h.onCopyLink).toHaveBeenCalledWith('/d/42');
      expect(response).toMatchObject({ ok: true, status: 200 });
    });

    it('copies the current page when the plugin names none', async () => {
      const h = await harness();

      await h.send({ kind: 'copyLink' });

      expect(h.onCopyLink).toHaveBeenCalledWith(undefined);
    });

    it('refuses to copy a link to an invalid route', async () => {
      const h = await harness();

      const response = await h.send({ kind: 'copyLink', path: '/../x' });

      expect(response).toMatchObject({
        ok: false,
        error: { code: 'PROTOCOL_ERROR', message: 'The plugin route is invalid' },
      });
      expect(h.onCopyLink).not.toHaveBeenCalled();
    });

    it('answers a copy the host declines with a refusal that does not echo its reason', async () => {
      const h = await harness();
      h.onCopyLink.mockRejectedValueOnce(new Error(`clipboard denied for ${RUNTIME_TOKEN}`));

      const response = await h.send({ kind: 'copyLink', path: '/d/42' });

      expect(response).toMatchObject({
        ok: false,
        error: { code: 'FORBIDDEN', message: 'The link could not be copied' },
      });
      expect(JSON.stringify(response)).not.toContain(RUNTIME_TOKEN);
    });
  });

  describe('errors', () => {
    it('refreshes the runtime token once and retries a 401 response', async () => {
      let attempt = 0;
      const h = await harness(async () => {
        attempt += 1;
        return attempt === 1
          ? Response.json({ message: 'expired' }, { status: 401 })
          : Response.json({ recovered: true });
      });

      const response = await h.send({ kind: 'api', method: 'GET', path: '/api/data-marts' });

      expect(response).toMatchObject({ ok: true, body: { recovered: true } });
      expect(h.fetchRuntimeToken).toHaveBeenCalledTimes(2);
      expect(h.fetchMock).toHaveBeenCalledTimes(2);
    });

    it('keeps successful GET streams transferable through the host', async () => {
      const h = await harness(
        async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new TextEncoder().encode('{"row":1}\n'));
                controller.close();
              },
            }),
            { status: 200, headers: { 'content-type': 'application/x-ndjson' } }
          )
      );

      const response = await h.send({
        kind: 'api',
        method: 'GET',
        path: '/api/data-marts.ndjson',
        stream: true,
      });

      expect(response).toMatchObject({
        ok: true,
        status: 200,
        headers: { 'content-type': 'application/x-ndjson' },
      });
      expect('stream' in response ? await new Response(response.stream).text() : undefined).toBe(
        '{"row":1}\n'
      );
    });

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

    it('passes the API code and its refusal details on beside the transport code', async () => {
      const errors = [{ instancePath: '/documentId', message: 'must be string' }];
      const h = await harness(async () =>
        Response.json(
          {
            code: 'INVALID_INPUT',
            message: 'Input does not match the action schema',
            errorDetails: { errors },
            // Not part of the payload: refusal details travel only in `details`.
            errors,
          },
          { status: 400 }
        )
      );

      const response = await h.send({
        kind: 'api',
        method: 'POST',
        path: '/api/plugins/runtime/actions/sync/executions',
        body: { input: {} },
      });

      expect(response).toMatchObject({ ok: false });
      expect(response.ok ? undefined : response.error).toEqual({
        code: 'HTTP_ERROR',
        status: 400,
        message: 'Input does not match the action schema',
        details: { errors },
        apiCode: 'INVALID_INPUT',
      });
    });

    it('keeps SUSPENDED as the transport code and still names the API code', async () => {
      const h = await harness(async () =>
        Response.json({ code: 'PLUGIN_SUSPENDED', message: 'unavailable' }, { status: 400 })
      );

      const response = await h.send({ kind: 'api', method: 'GET', path: '/api/data-marts' });

      expect(response).toMatchObject({
        ok: false,
        error: { code: 'SUSPENDED', apiCode: 'PLUGIN_SUSPENDED' },
      });
    });

    it('passes the API code of a Credential failure', async () => {
      const h = await harness(async () =>
        Response.json(
          { code: 'CREDENTIAL_REJECTED', message: 'The provider refused the key' },
          { status: 403 }
        )
      );

      const response = await h.send({
        kind: 'credentialFetch',
        version: 1,
        handle: 'github',
        url: 'https://api.github.com/user',
        method: 'GET',
      });

      expect(response).toMatchObject({
        ok: false,
        error: { code: 'HTTP_ERROR', status: 403, apiCode: 'CREDENTIAL_REJECTED' },
      });
    });

    it('passes the API code of a failed stream', async () => {
      const h = await harness(async () =>
        Response.json({ code: 'RUN_LIMIT', message: 'Too many runs' }, { status: 409 })
      );

      const response = await h.send({
        kind: 'api',
        method: 'GET',
        path: '/api/data-marts.ndjson',
        stream: true,
      });

      expect(response).toMatchObject({
        ok: false,
        error: { code: 'HTTP_ERROR', status: 409, apiCode: 'RUN_LIMIT' },
      });
    });

    it('adds no API code when the body has none', async () => {
      const h = await harness(async () => Response.json({ code: 42 }, { status: 500 }));

      const response = await h.send({ kind: 'api', method: 'GET', path: '/api/x' });

      expect(response.ok).toBe(false);
      expect(response.ok ? undefined : response.error).not.toHaveProperty('apiCode');
    });
  });
});
