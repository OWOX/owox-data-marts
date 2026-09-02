import { describe, expect, it, vi } from 'vitest';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import { createPluginCredentials, exactCredential, type CredentialHandle } from './credentials.js';

describe('Plugin Credentials', () => {
  it('turns asFetch into a versioned host request and rebuilds the provider Response', async () => {
    const send = vi.fn().mockResolvedValue({
      id: 'response-1',
      ok: true,
      status: 200,
      headers: {},
      body: {
        status: 201,
        headers: { 'content-type': 'application/json' },
        bodyBase64: btoa('{"ok":true}'),
      },
    });
    const credentials = createPluginCredentials({ send }, ['github']);

    const response = await exactCredential(credentials, 'github')!.asFetch()(
      'https://api.github.com/user',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"name":"test"}',
      }
    );

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'credentialFetch',
        version: 1,
        handle: 'github',
        url: 'https://api.github.com/user',
        method: 'POST',
      }),
      expect.any(AbortSignal)
    );
    const request = send.mock.calls[0]![0] as { bodyBase64: string };
    expect(atob(request.bodyBase64)).toBe('{"name":"test"}');
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('never exposes a raw secret getter', () => {
    const handle = exactCredential(
      createPluginCredentials({ send: vi.fn() }, ['github']),
      'github'
    ) as unknown as Record<string, unknown>;
    expect(Object.keys(handle)).toEqual(['asFetch']);
    expect(handle.secret).toBeUndefined();
    expect(handle.value).toBeUndefined();
  });

  it('preserves a custom Fetch-compatible provider method', async () => {
    const send = vi.fn().mockResolvedValue({
      id: 'response-1',
      ok: true,
      status: 200,
      headers: {},
      body: { status: 204, headers: {}, bodyBase64: '' },
    });
    const credentials = createPluginCredentials({ send }, ['github']);

    await exactCredential(credentials, 'github')!.asFetch()('https://api.github.com/resource', {
      method: 'PROPFIND',
    });

    expect(send.mock.calls[0]![0]).toMatchObject({ method: 'PROPFIND' });
  });

  it('does not create a handle that the current plugin version did not declare', () => {
    const credentials = createPluginCredentials({ send: vi.fn() }, ['github']);
    expect(exactCredential(credentials, 'github')).toBeDefined();
    expect(exactCredential(credentials, 'openai')).toBeUndefined();
  });

  it('types built-in and external exact handles through the same accessor', () => {
    const credentials = createPluginCredentials({ send: vi.fn() }, [
      'github',
      'acme',
      { name: 'ai', kind: 'ai', models: ['fast'] },
    ]);

    const github: CredentialHandle | undefined = exactCredential(credentials, 'github');
    const acme: CredentialHandle | undefined = exactCredential(credentials, 'acme');

    expect(github).toBeDefined();
    expect(acme).toBeDefined();
    expect(exactCredential(credentials, 'ai')).toBeUndefined();
  });

  it('exposes declared handles through normal Record discovery operations', () => {
    const credentials = createPluginCredentials({ send: vi.fn() }, ['github', 'custom']);

    expect('github' in credentials).toBe(true);
    expect('openai' in credentials).toBe(false);
    expect(Object.keys(credentials)).toEqual(['github', 'custom']);
    expect(JSON.stringify(credentials)).toBe('{"github":{},"custom":{}}');
  });

  it('rejects an already-aborted fetch with an AbortError even without a reason', async () => {
    const controller = new AbortController();
    controller.abort();
    const credentials = createPluginCredentials({ send: vi.fn() }, ['github']);

    await expect(
      exactCredential(credentials, 'github')!.asFetch()('https://api.github.com/user', {
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('propagates the caller AbortSignal to the Host request', async () => {
    const send = vi.fn((_request, signal?: AbortSignal) => {
      return new Promise<never>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    });
    const credentials = createPluginCredentials({ send }, ['github']);
    const controller = new AbortController();
    const request = exactCredential(credentials, 'github')!.asFetch()(
      'https://api.github.com/user',
      {
        signal: controller.signal,
      }
    );

    controller.abort(new DOMException('cancelled', 'AbortError'));
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('exposes a portable LanguageModelV4 generate contract without plugin headers', async () => {
    const send = vi.fn().mockResolvedValue({
      id: 'response-1',
      ok: true,
      status: 200,
      headers: {},
      body: {
        content: [{ type: 'tool-call', toolCallId: 'call-1', toolName: 'weather', input: '{}' }],
        finishReason: { unified: 'tool-calls' },
        usage: {
          inputTokens: { total: 10 },
          outputTokens: { total: 3 },
        },
        warnings: [],
      },
    });
    const model = createPluginCredentials({ send }, [
      { name: 'ai', kind: 'ai', models: ['fast', 'reasoning'] },
    ]).ai!.reasoning!;

    const result = await model.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'weather?' }] }],
      responseFormat: { type: 'json', schema: { type: 'object' } },
      tools: [
        {
          type: 'function',
          name: 'weather',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
      headers: { authorization: 'must-not-cross' },
      providerOptions: { openai: { secretOption: true } },
    } as never);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'credentialAi',
        version: 1,
        handle: 'ai',
        operation: 'generate',
        model: 'reasoning',
        options: expect.objectContaining({
          responseFormat: { type: 'json', schema: { type: 'object' } },
          tools: expect.any(Array),
        }),
      }),
      undefined
    );
    const options = send.mock.calls[0]![0].options as Record<string, unknown>;
    expect(options).not.toHaveProperty('headers');
    expect(options).not.toHaveProperty('providerOptions');
    expect(result.content[0]).toMatchObject({ type: 'tool-call', toolName: 'weather' });
  });

  it('streams LanguageModelV4 parts incrementally, including tool calls', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({ type: 'text-start', id: 'text-1' })}\n${JSON.stringify({
              type: 'text-delta',
              id: 'text-1',
              delta: 'hello',
            })}\n`
          )
        );
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'lookup',
              input: '{}',
            })}\n`
          )
        );
        controller.close();
      },
    });
    const send = vi.fn().mockResolvedValue({
      id: 'response-1',
      ok: true,
      status: 200,
      headers: { 'content-type': 'application/x-ndjson' },
      stream: body,
    });
    const ai = createPluginCredentials({ send }, [
      { name: 'ai', kind: 'ai', models: ['fast'] },
    ]).ai!;
    const model = ai.fast!;

    const result = await model.doStream({ prompt: [] });
    const reader = result.stream.getReader();
    await expect(reader.read()).resolves.toMatchObject({ value: { type: 'text-start' } });
    await expect(reader.read()).resolves.toMatchObject({
      value: { type: 'text-delta', delta: 'hello' },
    });
    await expect(reader.read()).resolves.toMatchObject({
      value: { type: 'tool-call', toolName: 'lookup' },
    });
    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
    expect(send.mock.calls[0]![0]).toMatchObject({ operation: 'stream', stream: true });
  });

  it('exposes an EmbeddingModelV4 backed by the logical embedding mapping', async () => {
    const send = vi.fn().mockResolvedValue({
      id: 'response-1',
      ok: true,
      status: 200,
      headers: {},
      body: { embeddings: [[0.1, 0.2]], usage: { tokens: 2 }, warnings: [] },
    });
    const ai = createPluginCredentials({ send }, [
      { name: 'ai', kind: 'ai', models: ['embedding'] },
    ]).ai!;
    const model = ai.embedding!;

    await expect(model.doEmbed({ values: ['hello'] })).resolves.toMatchObject({
      embeddings: [[0.1, 0.2]],
    });
    expect(send.mock.calls[0]![0]).toMatchObject({
      kind: 'credentialAi',
      operation: 'embed',
      model: 'embedding',
    });
  });

  it('exposes only declared logical AI models and never exposes asFetch on a logical handle', () => {
    const ai = createPluginCredentials({ send: vi.fn() }, [
      { name: 'ai', kind: 'ai', models: ['fast', 'embedding'] },
    ]).ai! as unknown as Record<string, unknown>;

    expect(ai.fast).toBeDefined();
    expect(ai.fast).toBe(ai);
    expect(ai.embedding).toBeDefined();
    expect(ai.reasoning).toBeUndefined();
    expect(ai.doGenerate).toBeTypeOf('function');
    expect(ai.asFetch).toBeUndefined();
    expect(ai.secret).toBeUndefined();
  });

  it('types the logical AI handle itself as the fast language model', () => {
    const ai = createPluginCredentials({ send: vi.fn() }, [
      { name: 'ai', kind: 'ai', models: ['fast'] },
    ]).ai!;
    const fastModel: LanguageModelV4 = ai.fast!;
    const directModel: LanguageModelV4 = ai;

    expect(directModel).toBe(fastModel);
  });

  it('routes the direct logical AI handle through the fast model mapping', async () => {
    const send = vi.fn().mockResolvedValue({
      id: 'response-1',
      ok: true,
      status: 200,
      headers: {},
      body: {
        content: [{ type: 'text', text: 'hello' }],
        finishReason: { unified: 'stop' },
        usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
        warnings: [],
      },
    });
    const model: LanguageModelV4 = createPluginCredentials({ send }, [
      { name: 'ai', kind: 'ai', models: ['fast'] },
    ]).ai!;

    await model.doGenerate({ prompt: [] });

    expect(send.mock.calls[0]![0]).toMatchObject({
      kind: 'credentialAi',
      operation: 'generate',
      model: 'fast',
    });
  });

  it('does not grant fast access through the direct handle when fast was not declared', async () => {
    const send = vi.fn();
    const ai = createPluginCredentials({ send }, [
      { name: 'ai', kind: 'ai', models: ['reasoning'] },
    ]).ai!;

    expect(ai.fast).toBeUndefined();
    await expect(ai.doGenerate({ prompt: [] })).rejects.toMatchObject({
      name: 'PluginTransportError',
      payload: { code: 'FORBIDDEN' },
    });
    expect(send).not.toHaveBeenCalled();
  });
});
