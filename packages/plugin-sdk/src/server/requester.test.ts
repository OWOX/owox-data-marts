// @vitest-environment node
import { OWOXApiClient } from '@owox/api-client';
import { describe, expect, it, vi } from 'vitest';
import { createPluginCollection } from '../collections.js';
import { createPluginCredentials, exactCredential } from '../credentials.js';
import { createIframeTransport } from '../iframe-transport.js';
import { createServerRequester, PRIVATE_ADDRESS_CODE } from './requester.js';

const HOST = 'https://app.owox.test';
const TOKEN = 'execution-token';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function setup(...responses: Response[]) {
  const fetchMock = vi.fn<(input: URL | RequestInfo, init?: RequestInit) => Promise<Response>>();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  return {
    fetchMock,
    requester: createServerRequester({ host: HOST, token: TOKEN, fetch: fetchMock }),
  };
}

function sentHeaders(init: RequestInit | undefined) {
  return new Headers(init?.headers);
}

describe('createServerRequester', () => {
  it('calls the OWOX API with the execution token and no redirects', async () => {
    const { fetchMock, requester } = setup(jsonResponse(200, { items: [] }));

    const response = await requester.send({
      kind: 'api',
      method: 'GET',
      path: '/api/data-marts',
      query: [
        ['column', 'a'],
        ['column', 'b'],
      ],
    });

    expect(response).toEqual({
      id: '',
      ok: true,
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: { items: [] },
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://app.owox.test/api/data-marts?column=a&column=b');
    expect(init).toMatchObject({ method: 'GET', redirect: 'manual' });
    expect(sentHeaders(init).get('x-owox-execution-token')).toBe(TOKEN);
    expect(sentHeaders(init).get('x-owox-authorization')).toBeNull();
  });

  it('sends a JSON body with its content type', async () => {
    const { fetchMock, requester } = setup(jsonResponse(200, { id: 'd1' }));

    await requester.send({ kind: 'api', method: 'PUT', path: '/api/x', body: { a: 1 } });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.body).toBe('{"a":1}');
    expect(sentHeaders(init).get('content-type')).toBe('application/json');
  });

  it('maps an API error the way the host bridge does', async () => {
    const errors = [{ instancePath: '/a', message: 'must be string' }];
    const { requester } = setup(
      // A top-level `errors` is not part of the payload: refusal details travel in `details`.
      jsonResponse(400, {
        code: 'INVALID_INPUT',
        message: 'bad',
        errors,
        errorDetails: { errors },
      }),
      jsonResponse(400, { code: 'PLUGIN_SUSPENDED', message: 'suspended' }),
      new Response('not json', { status: 500 })
    );

    await expect(requester.send({ kind: 'api', method: 'GET', path: '/api/x' })).resolves.toEqual({
      id: '',
      ok: false,
      error: {
        code: 'HTTP_ERROR',
        status: 400,
        message: 'bad',
        details: { errors },
        apiCode: 'INVALID_INPUT',
      },
    });
    await expect(
      requester.send({ kind: 'api', method: 'GET', path: '/api/x' })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'SUSPENDED', status: 400, apiCode: 'PLUGIN_SUSPENDED' },
    });
    await expect(
      requester.send({ kind: 'api', method: 'GET', path: '/api/x' })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'HTTP_ERROR', status: 500, message: 'Request failed with 500' },
    });
  });

  it('refuses a redirect instead of following it', async () => {
    const { requester } = setup(
      new Response(null, { status: 302, headers: { location: 'https://evil.test/' } })
    );

    await expect(requester.send({ kind: 'api', method: 'GET', path: '/api/x' })).resolves.toEqual({
      id: '',
      ok: false,
      error: { code: 'HTTP_ERROR', status: 302, message: 'Redirects are refused' },
    });
  });

  it.each(['/admin', '//evil.test/api/x', 'https://evil.test/api/x', '/api/../admin', 'api/x'])(
    'refuses %s without calling fetch',
    async path => {
      const { fetchMock, requester } = setup();

      await expect(requester.send({ kind: 'api', method: 'GET', path })).resolves.toMatchObject({
        ok: false,
        error: { code: 'FORBIDDEN' },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('returns a stream for a stream request', async () => {
    const { requester } = setup(new Response('{"a":1}\n{"a":2}\n', { status: 200 }));

    const response = await requester.send({
      kind: 'api',
      method: 'GET',
      path: '/api/x',
      stream: true,
    });

    expect(response.ok && 'stream' in response).toBe(true);
    const text = await new Response((response as { stream: ReadableStream }).stream).text();
    expect(text).toBe('{"a":1}\n{"a":2}\n');
  });

  it('reports a network failure as NETWORK_ERROR', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const requester = createServerRequester({ host: HOST, token: TOKEN, fetch: fetchMock });

    await expect(requester.send({ kind: 'api', method: 'GET', path: '/api/x' })).resolves.toEqual({
      id: '',
      ok: false,
      error: { code: 'NETWORK_ERROR', message: 'fetch failed' },
    });
  });

  it("reports server/node's private-address refusal as FORBIDDEN", async () => {
    const refusal = Object.assign(new Error('app.owox.test resolves to a private address'), {
      code: PRIVATE_ADDRESS_CODE,
    });
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed', { cause: refusal }));
    const requester = createServerRequester({ host: HOST, token: TOKEN, fetch: fetchMock });

    await expect(requester.send({ kind: 'api', method: 'GET', path: '/api/x' })).resolves.toEqual({
      id: '',
      ok: false,
      error: { code: 'FORBIDDEN', message: 'app.owox.test resolves to a private address' },
    });
  });

  it('rejects with the abort reason when the caller aborts', async () => {
    const reason = new Error('deadline');
    const controller = new AbortController();
    controller.abort(reason);
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError'));
    const requester = createServerRequester({ host: HOST, token: TOKEN, fetch: fetchMock });

    await expect(
      requester.send({ kind: 'api', method: 'GET', path: '/api/x' }, controller.signal)
    ).rejects.toBe(reason);
  });

  it('refuses request kinds a backend cannot use', async () => {
    const { fetchMock, requester } = setup();

    await expect(
      requester.send({ kind: 'openExternal', url: 'https://example.com' })
    ).resolves.toEqual({
      id: '',
      ok: false,
      error: { code: 'PROTOCOL_ERROR', message: 'Not available in a backend action' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('serves the logical AI Credential through the credential AI routes', async () => {
    const { fetchMock, requester } = setup(
      jsonResponse(200, {
        content: [{ type: 'text', text: 'hello' }],
        finishReason: { unified: 'stop' },
        usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
        warnings: [],
      })
    );
    const ai = createPluginCredentials(requester, [
      { name: 'ai', kind: 'ai', models: ['fast'] },
    ]).ai!;

    await expect(ai.doGenerate({ prompt: [] })).resolves.toMatchObject({
      content: [{ type: 'text', text: 'hello' }],
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://app.owox.test/api/plugins/runtime/credentials/ai/ai/generate'
    );
    expect(init).toMatchObject({ method: 'POST', redirect: 'manual' });
    expect(JSON.parse(String(init?.body))).toEqual({
      version: 1,
      model: 'fast',
      options: { prompt: [] },
    });
    expect(sentHeaders(init).get('x-owox-execution-token')).toBe(TOKEN);
  });

  it('streams the logical AI Credential as NDJSON', async () => {
    const { fetchMock, requester } = setup(
      new Response('{"type":"text-delta","id":"t1","delta":"hello"}\n', {
        status: 200,
        headers: { 'content-type': 'application/x-ndjson' },
      })
    );
    const ai = createPluginCredentials(requester, [
      { name: 'ai', kind: 'ai', models: ['fast'] },
    ]).ai!;

    const reader = (await ai.doStream({ prompt: [] })).stream.getReader();

    await expect(reader.read()).resolves.toMatchObject({
      value: { type: 'text-delta', delta: 'hello' },
    });
    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://app.owox.test/api/plugins/runtime/credentials/ai/ai/stream');
    expect(sentHeaders(init).get('accept')).toBe('application/x-ndjson');
  });

  it('embeds through the logical AI Credential', async () => {
    const { fetchMock, requester } = setup(
      jsonResponse(200, { embeddings: [[0.1, 0.2]], usage: { tokens: 2 }, warnings: [] })
    );
    const ai = createPluginCredentials(requester, [
      { name: 'ai', kind: 'ai', models: ['embedding'] },
    ]).ai!;

    await expect(ai.embedding!.doEmbed({ values: ['hello'] })).resolves.toMatchObject({
      embeddings: [[0.1, 0.2]],
    });
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      'https://app.owox.test/api/plugins/runtime/credentials/ai/ai/embed'
    );
  });

  it('passes an AI refusal through as the frame would see it', async () => {
    const { requester } = setup(
      jsonResponse(403, { code: 'CREDENTIAL_REJECTED', message: 'The provider rejected the key' })
    );
    const ai = createPluginCredentials(requester, [
      { name: 'ai', kind: 'ai', models: ['fast'] },
    ]).ai!;

    await expect(ai.doGenerate({ prompt: [] })).rejects.toMatchObject({
      name: 'PluginTransportError',
      payload: {
        code: 'HTTP_ERROR',
        status: 403,
        apiCode: 'CREDENTIAL_REJECTED',
        message: 'The provider rejected the key',
      },
    });
  });

  it('answers an unreadable AI result as the frame does, not with a SyntaxError', async () => {
    const { requester } = setup(new Response('<html>', { status: 200 }));
    const ai = createPluginCredentials(requester, [
      { name: 'ai', kind: 'ai', models: ['fast'] },
    ]).ai!;

    await expect(ai.doGenerate({ prompt: [] })).rejects.toMatchObject({
      name: 'PluginTransportError',
      payload: { code: 'NETWORK_ERROR', message: 'The request could not be completed' },
    });
  });

  it('serves exact Credentials through the credential fetch route', async () => {
    const { fetchMock, requester } = setup(
      jsonResponse(200, { status: 200, headers: {}, bodyBase64: btoa('{"ok":true}') })
    );
    const credentials = createPluginCredentials(requester, [
      { name: 'google sheets', kind: 'exact' },
    ]);

    const response = await exactCredential(credentials, 'google sheets')!.asFetch()(
      'https://sheets.googleapis.com/v4/spreadsheets/s1'
    );

    await expect(response.json()).resolves.toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://app.owox.test/api/plugins/runtime/credentials/google%20sheets/fetch'
    );
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      url: 'https://sheets.googleapis.com/v4/spreadsheets/s1',
      method: 'GET',
      headers: {},
    });
    expect(sentHeaders(init).get('x-owox-execution-token')).toBe(TOKEN);
  });

  it('keeps a missing collection document a null, as in the frame', async () => {
    const { requester } = setup(jsonResponse(404, { message: 'Not found' }));
    const owox = new OWOXApiClient({ transport: createIframeTransport(requester) });

    await expect(createPluginCollection(owox, 'documents').get('d1')).resolves.toBeNull();
  });
});
