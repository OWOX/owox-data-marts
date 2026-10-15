// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBackend, exactCredential, type BackendActionHandler } from './index.js';

const HOST = 'https://app.owox.test';
const TOKEN = 'execution-token';
const CURRENT_URL = 'https://app.owox.test/api/plugins/runtime/executions/current';
const REPOSITORY_ID = '987654321';

function context(overrides: Record<string, unknown> = {}) {
  return {
    executionId: 'e1',
    action: 'count',
    input: { documentId: 'd1' },
    trigger: 'frontend',
    deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    pluginVersion: '1.2.0',
    installationId: 'i1',
    projectId: 'j1',
    userId: 'u1',
    plugin: { id: 'p1', repositoryId: REPOSITORY_ID },
    credentialHandles: [{ name: 'sheets', kind: 'exact' }],
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function actionRequest(
  options: { body?: unknown; token?: string | null; method?: string } = {}
): Request {
  const {
    body = { owox: 1, host: HOST, executionId: 'e1' },
    token = TOKEN,
    method = 'POST',
  } = options;
  return new Request('https://worker.acme.test/owox', {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'x-owox-execution-token': token } : {}),
    },
    ...(method === 'GET' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}

async function read(response: Response) {
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const fetchMock = vi.fn<(input: URL | RequestInfo, init?: RequestInit) => Promise<Response>>();

function backend(actions: Record<string, BackendActionHandler>) {
  return createBackend({ repositoryId: REPOSITORY_ID, hosts: [HOST], actions });
}

function hostlessBackend(actions: Record<string, BackendActionHandler>) {
  return createBackend({ repositoryId: REPOSITORY_ID, actions });
}

function onWorkers() {
  vi.stubGlobal('navigator', { userAgent: 'Cloudflare-Workers' });
}

describe('createBackend', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([[[]], [['https://app.owox.test/']], [['https://*.owox.com']], [['app.owox.com']]])(
    'refuses hosts %j at creation',
    hosts => {
      expect(() => createBackend({ repositoryId: REPOSITORY_ID, hosts, actions: {} })).toThrow(
        TypeError
      );
    }
  );

  it.each(['', '0', '0123', '12a', '1'.repeat(21), 123])(
    'refuses repositoryId %j at creation',
    repositoryId => {
      expect(() =>
        createBackend({ repositoryId: repositoryId as string, hosts: [HOST], actions: {} })
      ).toThrow(/gh api repos\/OWNER\/NAME --jq \.id/);
    }
  );

  it('refuses to start without hosts outside Cloudflare Workers', () => {
    expect(() => hostlessBackend({})).toThrow(
      'createBackend: on this runtime list hosts, or import createBackend from @owox/plugin-sdk/server/node, which checks the addresses it connects to'
    );
  });

  it('runs the handler of the current execution and answers its result', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, context()));
    const handler = vi.fn<BackendActionHandler>().mockResolvedValue({ count: 3 });

    const response = await backend({ count: handler }).fetch(actionRequest());

    expect(await read(response)).toEqual({ status: 200, body: { result: { count: 3 } } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(CURRENT_URL);
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('x-owox-execution-token')).toBe(TOKEN);
    const [input, ctx] = handler.mock.calls[0]!;
    expect(input).toEqual({ documentId: 'd1' });
    const { credentialHandles: _handles, ...execution } = context();
    expect(ctx.execution).toEqual({ ...execution, deadlineAt: expect.any(String) });
    expect(ctx.execution.plugin).toEqual({ id: 'p1', repositoryId: REPOSITORY_ID });
    expect(ctx.host).toBe(HOST);
    expect(Object.keys(ctx.credentials)).toEqual(['sheets']);
    expect(typeof ctx.collections).toBe('function');
    expect(ctx.signal.aborted).toBe(false);
  });

  it('gives the handler an OWOX client that sends the execution token', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, context()))
      .mockResolvedValueOnce(jsonResponse(200, { items: [] }));

    const response = await backend({
      count: (_input, ctx) => ctx.owox.getJson('/api/data-marts'),
    }).fetch(actionRequest());

    expect(await read(response)).toEqual({ status: 200, body: { result: { items: [] } } });
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(String(url)).toBe('https://app.owox.test/api/data-marts');
    expect(new Headers(init?.headers).get('x-owox-execution-token')).toBe(TOKEN);
  });

  it('sends a gaxios-style asFetch call to OWOX as plain JSON without authorization', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, context({ credentialHandles: [{ name: 'google', kind: 'exact' }] }))
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { status: 200, headers: {}, bodyBase64: btoa('{}') })
      );

    await backend({
      count: async (_input, ctx) => {
        const google = exactCredential(ctx.credentials, 'google');
        // gaxios passes a URL and its own config keys in init.
        const response = await google!.asFetch()(
          new URL('https://docs.googleapis.com/v1/documents/d1:batchUpdate'),
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{"requests":[]}',
            responseType: 'json',
            retry: true,
            retryConfig: { retry: 3 },
          } as RequestInit
        );
        return response.status;
      },
    }).fetch(actionRequest());

    const [url, init] = fetchMock.mock.calls[1]!;
    expect(String(url)).toBe('https://app.owox.test/api/plugins/runtime/credentials/google/fetch');
    const sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual(['bodyBase64', 'headers', 'method', 'url']);
    expect(sent).toMatchObject({
      url: 'https://docs.googleapis.com/v1/documents/d1:batchUpdate',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    expect(sent.headers).not.toHaveProperty('authorization');
    expect(atob(String(sent.bodyBase64))).toBe('{"requests":[]}');
  });

  it('answers a null result for a handler that returns nothing', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, context()));

    const response = await backend({ count: () => undefined }).fetch(actionRequest());

    expect(await read(response)).toEqual({ status: 200, body: { result: null } });
  });

  it('refuses a method other than POST', async () => {
    const response = await backend({}).fetch(actionRequest({ method: 'GET' }));

    expect(await read(response)).toMatchObject({
      status: 405,
      body: { error: { code: 'METHOD_NOT_ALLOWED' } },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'no token', options: { token: null } },
    { name: 'a body that is not JSON', options: { body: 'not json' } },
    {
      name: 'another protocol version',
      options: { body: { owox: 2, host: HOST, executionId: 'e1' } },
    },
    { name: 'no execution id', options: { body: { owox: 1, host: HOST } } },
  ])('refuses a request with $name', async ({ options }) => {
    const response = await backend({}).fetch(actionRequest(options));

    expect(await read(response)).toMatchObject({
      status: 400,
      body: { error: { code: 'BAD_REQUEST' } },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts any public HTTPS deployment on Workers when hosts is not given', async () => {
    onWorkers();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, context()));
    const handler = vi.fn<BackendActionHandler>().mockResolvedValue('ok');

    const response = await hostlessBackend({ count: handler }).fetch(
      actionRequest({ body: { owox: 1, host: 'https://odm.example.test', executionId: 'e1' } })
    );

    expect(await read(response)).toEqual({ status: 200, body: { result: 'ok' } });
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      'https://odm.example.test/api/plugins/runtime/executions/current'
    );
    expect(handler.mock.calls[0]![1].host).toBe('https://odm.example.test');
  });

  it.each([
    'http://odm.example.test',
    'https://127.0.0.1',
    'https://[::1]',
    'https://[fd00::1]',
    'https://localhost',
    'https://a.localhost',
    'https://a.localhost.',
    'https://printer.local',
    'https://x.internal',
    'https://router.home.arpa',
    'https://intranet',
    'https://intranet.',
  ])('refuses the non-public host %s without hosts before any request', async host => {
    onWorkers();

    const response = await hostlessBackend({}).fetch(
      actionRequest({ body: { owox: 1, host, executionId: 'e1' } })
    );

    expect(await read(response)).toEqual({
      status: 403,
      body: {
        error: {
          code: 'HOST_NOT_ALLOWED',
          message: `${new URL(host).origin} is not a public HTTPS origin; list internal deployments in hosts`,
        },
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls an internal http: host that hosts lists', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, context()));

    const response = await createBackend({
      repositoryId: REPOSITORY_ID,
      hosts: ['http://odm.internal:3000'],
      actions: { count: () => 'ok' },
    }).fetch(
      actionRequest({ body: { owox: 1, host: 'http://odm.internal:3000', executionId: 'e1' } })
    );

    expect(await read(response)).toEqual({ status: 200, body: { result: 'ok' } });
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      'http://odm.internal:3000/api/plugins/runtime/executions/current'
    );
  });

  // A numeric IPv4 form is not the origin URL parsing makes of it, so it never reaches the name check.
  it.each([
    'odm.example.test',
    'https://odm.example.test/',
    'https://odm.example.test/path',
    'https://2130706433',
    'https://0x7f.1',
  ])('refuses a host %j that is not an origin', async host => {
    onWorkers();
    const response = await hostlessBackend({}).fetch(
      actionRequest({ body: { owox: 1, host, executionId: 'e1' } })
    );

    expect(await read(response)).toMatchObject({
      status: 400,
      body: { error: { code: 'BAD_REQUEST' } },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a host it does not list without calling it', async () => {
    const response = await backend({}).fetch(
      actionRequest({ body: { owox: 1, host: 'https://evil.test', executionId: 'e1' } })
    );

    expect(await read(response)).toMatchObject({
      status: 403,
      body: { error: { code: 'HOST_NOT_ALLOWED' } },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('runs nothing for a token OWOX does not accept', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { message: 'Invalid execution token' }));
    const handler = vi.fn<BackendActionHandler>();

    const response = await backend({ count: handler }).fetch(actionRequest());

    expect(await read(response)).toMatchObject({
      status: 401,
      body: { error: { code: 'UNAUTHORIZED' } },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    { status: 404, code: 'NOT_FOUND', message: 'Credential sheets is not configured' },
    { status: 403, code: 'FORBIDDEN', message: 'Credential use permission is no longer available' },
  ])(
    'reports a $status context OWOX cannot build, with its message',
    async ({ status, code, message }) => {
      fetchMock.mockResolvedValueOnce(jsonResponse(status, { code, message }));
      const handler = vi.fn<BackendActionHandler>();

      const response = await backend({ count: handler }).fetch(actionRequest());

      expect(await read(response)).toEqual({
        status: 502,
        body: { error: { code: 'EXECUTION_CONTEXT_UNAVAILABLE', message } },
      });
      expect(handler).not.toHaveBeenCalled();
    }
  );

  it('reports a context whose action is not a string', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, context({ action: { toString: 1, valueOf: 1 } }))
    );
    const handler = vi.fn<BackendActionHandler>();

    const response = await backend({ count: handler }).fetch(actionRequest());

    expect(await read(response)).toMatchObject({
      status: 502,
      body: { error: { code: 'EXECUTION_CONTEXT_UNAVAILABLE' } },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'another plugin', plugin: { id: 'p2', repositoryId: '123456789' } },
    { name: 'no plugin', plugin: undefined },
  ])('runs nothing for an execution of $name', async ({ plugin }) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, context({ plugin })));
    const handler = vi.fn<BackendActionHandler>();

    const response = await backend({ count: handler }).fetch(actionRequest());

    expect(await read(response)).toEqual({
      status: 403,
      body: {
        error: { code: 'PLUGIN_MISMATCH', message: 'This execution belongs to another plugin' },
      },
    });
    expect(handler).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('runs nothing when the context belongs to another execution', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, context({ executionId: 'e2' })));
    const handler = vi.fn<BackendActionHandler>();

    const response = await backend({ count: handler }).fetch(actionRequest());

    expect(await read(response)).toMatchObject({
      status: 401,
      body: { error: { code: 'UNAUTHORIZED' } },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(['missing', 'constructor', 'toString'])(
    'answers ACTION_NOT_IMPLEMENTED for the action %s and calls nothing else',
    async action => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, context({ action })));

      const response = await backend({ count: vi.fn<BackendActionHandler>() }).fetch(
        actionRequest()
      );

      expect(await read(response)).toMatchObject({
        status: 404,
        body: { error: { code: 'ACTION_NOT_IMPLEMENTED' } },
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  it('fails with the code a handler throws', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, context()));

    const response = await backend({
      count: () => {
        throw Object.assign(new Error('The document is locked'), { code: 'DOCUMENT_LOCKED' });
      },
    }).fetch(actionRequest());

    expect(await read(response)).toEqual({
      status: 500,
      body: { error: { code: 'DOCUMENT_LOCKED', message: 'The document is locked' } },
    });
  });

  it.each([
    'BACKEND_DOWN',
    'TIMED_OUT',
    'CANCELLED',
    'INVALID_INPUT',
    'PLUGIN_SUSPENDED',
    'oops',
    42,
  ])('replaces the thrown code %s with ACTION_FAILED', async code => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, context()));

    const response = await backend({
      count: () => {
        throw Object.assign(new Error('nope'), { code });
      },
    }).fetch(actionRequest());

    expect(await read(response)).toEqual({
      status: 500,
      body: { error: { code: 'ACTION_FAILED', message: 'nope' } },
    });
  });

  it.each([
    {
      name: 'an error whose code getter throws',
      thrown: () =>
        Object.defineProperty(new Error('nope'), 'code', {
          get() {
            throw new Error('no code');
          },
        }),
      message: 'nope',
    },
    {
      name: 'a revoked Proxy',
      thrown: () => {
        const { proxy, revoke } = Proxy.revocable({}, {});
        revoke();
        return proxy;
      },
      message: 'The action failed',
    },
  ])('fails with ACTION_FAILED for $name', async ({ thrown, message }) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, context()));

    const response = await backend({
      count: () => {
        throw thrown();
      },
    }).fetch(actionRequest());

    expect(await read(response)).toEqual({
      status: 500,
      body: { error: { code: 'ACTION_FAILED', message } },
    });
  });

  it('cuts a long error message to 1,000 characters', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, context()));

    const response = await backend({
      count: () => {
        throw new Error('x'.repeat(1500));
      },
    }).fetch(actionRequest());

    const { body } = await read(response);
    expect((body.error as { message: string }).message).toHaveLength(1000);
  });

  it.each([
    { thrown: 'boom', message: 'boom' },
    { thrown: undefined, message: 'undefined' },
    { thrown: Object.create(null) as unknown, message: 'The action failed' },
  ])(
    'turns a thrown non-Error $thrown into ACTION_FAILED with a string message',
    async ({ thrown, message }) => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, context()));

      const response = await backend({
        count: () => {
          throw thrown;
        },
      }).fetch(actionRequest());

      expect(await read(response)).toEqual({
        status: 500,
        body: { error: { code: 'ACTION_FAILED', message } },
      });
    }
  );

  it.each([
    { name: 'a BigInt', value: () => ({ total: 1n }) },
    {
      name: 'a circular object',
      value: () => {
        const node: Record<string, unknown> = {};
        node.self = node;
        return node;
      },
    },
  ])('fails with ACTION_FAILED when the handler returns $name', async ({ value }) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, context()));

    const response = await backend({ count: value }).fetch(actionRequest());

    expect(await read(response)).toMatchObject({
      status: 500,
      body: { error: { code: 'ACTION_FAILED' } },
    });
  });

  it('aborts the handler signal at the deadline', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, context({ deadlineAt: new Date(Date.now() + 30).toISOString() }))
    );

    const response = await backend({
      count: (_input, ctx) =>
        new Promise(resolve => {
          ctx.signal.addEventListener('abort', () => resolve(ctx.signal.aborted), { once: true });
        }),
    }).fetch(actionRequest());

    expect(await read(response)).toEqual({ status: 200, body: { result: true } });
  });
});
