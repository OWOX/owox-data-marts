import { TooManyEmbeddingValuesForCallError } from '@ai-sdk/provider';
import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { createOwoxAiFetch, OwoxAiModelService } from './owox-ai-model.service';

const BASE_ENV: Record<string, string> = {
  AI_PROVIDER: 'openrouter',
  AI_BASE_URL: 'https://openrouter.ai/api/v1',
  AI_API_KEY: 'test-key',
  AI_PLUGIN_FAST_MODEL: 'fast-model',
  AI_PLUGIN_REASONING_MODEL: 'reasoning-model',
  AI_ALLOWED_PROVIDERS: 'Google-Vertex',
};

const ROUTING = {
  require_parameters: false,
  only: ['google-vertex'],
  order: ['google-vertex'],
  data_collection: 'deny',
  zdr: true,
};

const PROMPT = [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'hi' }] }];

function createService(env: Record<string, string>): OwoxAiModelService {
  const config = {
    get: (key: string, fallback?: unknown) => env[key] ?? fallback,
  } as unknown as ConfigService;
  return new OwoxAiModelService(config);
}

describe('OwoxAiModelService', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'chatcmpl-1',
            created: 1,
            model: 'm',
            choices: [
              { index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' },
            ],
            usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    );
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body as string);

  it('provides no models until base URL, key, fast and reasoning are set', () => {
    for (const key of [
      'AI_BASE_URL',
      'AI_API_KEY',
      'AI_PLUGIN_FAST_MODEL',
      'AI_PLUGIN_REASONING_MODEL',
    ]) {
      expect(createService({ ...BASE_ENV, [key]: '  ' }).models()).toEqual([]);
      const { [key]: _dropped, ...rest } = BASE_ENV;
      expect(createService(rest).models()).toEqual([]);
    }
  });

  it('adds embedding only when AI_PLUGIN_EMBEDDING_MODEL is set', () => {
    expect(createService(BASE_ENV).models()).toEqual(['fast', 'reasoning']);
    expect(createService({ ...BASE_ENV, AI_PLUGIN_EMBEDDING_MODEL: 'embed' }).models()).toEqual([
      'fast',
      'reasoning',
      'embedding',
    ]);
  });

  it('throws NotFoundException for embedding when it is not provided', () => {
    expect(() => createService(BASE_ENV).embeddingModel(new AbortController().signal)).toThrow(
      NotFoundException
    );
  });

  it('sends OpenRouter calls with the provider routing and the platform key', async () => {
    const model = createService(BASE_ENV).languageModel('fast', new AbortController().signal);
    await model.doGenerate({ prompt: PROMPT });

    expect(fetchMock.mock.calls[0][0].toString()).toBe(
      'https://openrouter.ai/api/v1/chat/completions'
    );
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('authorization')).toBe(
      'Bearer test-key'
    );
    expect(sentBody().model).toBe('fast-model');
    expect(sentBody().provider).toEqual(ROUTING);
  });

  // Vertex endpoints do not declare temperature or top_p. With require_parameters, OpenRouter
  // finds no endpoint for a call that sets them.
  it('lets OpenRouter serve a call with sampling options that an endpoint does not declare', async () => {
    const model = createService(BASE_ENV).languageModel('fast', new AbortController().signal);
    await model.doGenerate({ prompt: PROMPT, temperature: 0, topP: 0.9 });

    expect(sentBody()).toMatchObject({ temperature: 0, top_p: 0.9 });
    expect(sentBody().provider.require_parameters).toBe(false);
  });

  it('sends the JSON schema of a structured output to OpenRouter', async () => {
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] };
    const model = createService(BASE_ENV).languageModel('fast', new AbortController().signal);
    await model.doGenerate({ prompt: PROMPT, responseFormat: { type: 'json', schema } });

    expect(sentBody().response_format).toMatchObject({
      type: 'json_schema',
      json_schema: { schema },
    });
  });

  it('asks OpenRouter for stream usage', async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response('data: [DONE]\n\n', {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
    );
    const model = createService(BASE_ENV).languageModel('fast', new AbortController().signal);
    await model.doStream({ prompt: PROMPT });

    expect(sentBody().stream_options).toEqual({ include_usage: true });
  });

  it('replaces a provider field that the request body already has', async () => {
    const wrapped = createOwoxAiFetch(ROUTING, new AbortController().signal);
    await wrapped('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ provider: { only: ['x'] } }),
    });

    expect(sentBody().provider).toEqual(ROUTING);
  });

  // An oversized provider response is an upstream fault, whether its length is declared or not.
  const responseTooLarge = { status: 502, message: 'AI provider response is too large' };

  it('answers 502 for a chunked response body that grows over the size cap', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('x'.repeat(10 * 1024 * 1024 + 1), { status: 200 })
    );
    const wrapped = createOwoxAiFetch(null, new AbortController().signal);

    const response = await wrapped('https://openrouter.ai/api/v1/chat/completions');

    await expect(response.text()).rejects.toMatchObject(responseTooLarge);
  });

  it('answers 502 for a declared response length over the size cap', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{}', {
        status: 200,
        headers: { 'content-length': String(10 * 1024 * 1024 + 1) },
      })
    );
    const wrapped = createOwoxAiFetch(null, new AbortController().signal);

    await expect(wrapped('https://openrouter.ai/api/v1/chat/completions')).rejects.toMatchObject(
      responseTooLarge
    );
  });

  // The same refusal as the Credential path gives.
  it('answers 400 for a request body over the size limit', async () => {
    const wrapped = createOwoxAiFetch(null, new AbortController().signal);

    await expect(
      wrapped('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({ input: 'x'.repeat(1024 * 1024) }),
      })
    ).rejects.toMatchObject({ status: 400, message: 'Credential request body is too large' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([[undefined], ['not json'], ['[1]']])(
    'refuses to send a request without routing when the body is %p',
    async body => {
      const wrapped = createOwoxAiFetch(ROUTING, new AbortController().signal);

      await expect(
        wrapped('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body })
      ).rejects.toThrow('routing');
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('sends OpenAI calls without routing', async () => {
    const model = createService({ ...BASE_ENV, AI_PROVIDER: 'openai' }).languageModel(
      'fast',
      new AbortController().signal
    );
    await model.doGenerate({ prompt: PROMPT });

    expect(sentBody()).not.toHaveProperty('provider');
  });

  const noProviders = { require_parameters: false };
  it.each([
    ['unset', {}, { data_collection: 'deny', zdr: true }],
    ['blank', { AI_ZDR: '', AI_DATA_COLLECTION: ' ' }, { data_collection: 'deny', zdr: true }],
    [
      'false and allow',
      { AI_ZDR: 'false', AI_DATA_COLLECTION: 'allow' },
      { data_collection: 'allow', zdr: false },
    ],
    [
      'a provider list',
      { AI_ALLOWED_PROVIDERS: ' Azure, Google-Vertex ' },
      {
        only: ['azure', 'google-vertex'],
        order: ['azure', 'google-vertex'],
        data_collection: 'deny',
        zdr: true,
      },
    ],
  ])('builds the routing from the environment when it is %s', async (_name, env, expected) => {
    const model = createService({
      ...BASE_ENV,
      AI_ALLOWED_PROVIDERS: '',
      ...env,
      AI_PROVIDER: ' OpenRouter ',
    }).languageModel('fast', new AbortController().signal);
    await model.doGenerate({ prompt: PROMPT });

    expect(sentBody().provider).toEqual({ ...noProviders, ...expected });
  });

  it('sends embedding calls with the routing and applies the request size cap', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [{ index: 0, embedding: [0.1] }],
          usage: { prompt_tokens: 3, total_tokens: 3 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    const model = createService({ ...BASE_ENV, AI_PLUGIN_EMBEDDING_MODEL: 'embed' }).embeddingModel(
      new AbortController().signal
    );
    await model.doEmbed({ values: ['hi'] });

    expect(fetchMock.mock.calls[0][0].toString()).toBe('https://openrouter.ai/api/v1/embeddings');
    expect(sentBody().provider).toEqual(ROUTING);

    await expect(model.doEmbed({ values: ['x'.repeat(1024 * 1024)] })).rejects.toMatchObject({
      status: 400,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends each embedding value in its own OpenRouter request', async () => {
    // OpenRouter drops Vertex endpoints for a batch input, and the routing allows only Vertex.
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const [value] = JSON.parse(init.body as string).input as string[];
      return new Response(
        JSON.stringify({
          data: [{ index: 0, embedding: [value.length] }],
          usage: { prompt_tokens: 2, total_tokens: 2 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    });
    const model = createService({ ...BASE_ENV, AI_PLUGIN_EMBEDDING_MODEL: 'embed' }).embeddingModel(
      new AbortController().signal
    );

    const result = await model.doEmbed({ values: ['a', 'bb', 'ccc'] });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [, init] of fetchMock.mock.calls) {
      expect(JSON.parse(init.body as string).input).toHaveLength(1);
    }
    expect(result.embeddings).toEqual([[1], [2], [3]]);
    expect(result.usage).toEqual({ tokens: 6 });
  });

  it('stops the other OpenRouter embedding requests after the first failure', async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            data: [{ index: 0, embedding: [1] }],
            usage: { prompt_tokens: 1, total_tokens: 1 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    );
    const model = createService({ ...BASE_ENV, AI_PLUGIN_EMBEDDING_MODEL: 'embed' }).embeddingModel(
      new AbortController().signal
    );
    // The first value is over the request size cap, so its request fails before it goes out.
    const values = ['x'.repeat(1024 * 1024), ...Array.from({ length: 40 }, () => 'a')];

    await expect(model.doEmbed({ values })).rejects.toMatchObject({ status: 400 });
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(fetchMock.mock.calls.length).toBeLessThan(8);
    for (const [, init] of fetchMock.mock.calls) {
      expect((init as RequestInit).signal?.aborted).toBe(true);
    }
  });

  it('rejects more OpenRouter embedding values than one call accepts', async () => {
    const model = createService({ ...BASE_ENV, AI_PLUGIN_EMBEDDING_MODEL: 'embed' }).embeddingModel(
      new AbortController().signal
    );

    await expect(
      model.doEmbed({ values: Array.from({ length: 2049 }, () => 'a') })
    ).rejects.toBeInstanceOf(TooManyEmbeddingValuesForCallError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an OpenRouter embedding call with no values', async () => {
    const model = createService({ ...BASE_ENV, AI_PLUGIN_EMBEDDING_MODEL: 'embed' }).embeddingModel(
      new AbortController().signal
    );

    await expect(model.doEmbed({ values: [] })).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts the provider call when the caller signal aborts', async () => {
    const controller = new AbortController();
    const wrapped = createOwoxAiFetch(null, controller.signal);
    await wrapped('https://openrouter.ai/api/v1/chat/completions');
    const passed = fetchMock.mock.calls[0][1].signal as AbortSignal;
    expect(passed.aborted).toBe(false);

    controller.abort();

    expect(passed.aborted).toBe(true);
  });

  it('logs a failure under OWOX AI and cuts the deployment key out of it', () => {
    expect(createService(BASE_ENV).failureLog('reasoning')).toEqual({
      subject: 'OWOX AI, model reasoning',
      secret: 'test-key',
      trustedProvider: true,
    });
  });

  it('uses the reasoning model for reasoning', async () => {
    const model = createService(BASE_ENV).languageModel('reasoning', new AbortController().signal);
    await model.doGenerate({ prompt: PROMPT });

    expect(sentBody().model).toBe('reasoning-model');
  });

  describe('decision', () => {
    const DECISION_ENV: Record<string, string> = {
      AI_PLUGIN_DECISION_PROVIDER: 'cloudflare-workers-ai',
      AI_PLUGIN_DECISION_BASE_URL: 'https://api.cloudflare.com/client/v4/accounts/acc/ai',
      AI_PLUGIN_DECISION_API_KEY: 'decision-key',
      AI_PLUGIN_DECISION_MODEL: '@cf/cloudflare/clef-flash',
    };

    it('lists decision only when all four decision variables are set', () => {
      expect(createService({ ...BASE_ENV, ...DECISION_ENV }).models()).toEqual([
        'fast',
        'reasoning',
        'decision',
      ]);
      for (const key of Object.keys(DECISION_ENV)) {
        expect(createService({ ...BASE_ENV, ...DECISION_ENV, [key]: '  ' }).models()).toEqual([
          'fast',
          'reasoning',
        ]);
        const { [key]: _dropped, ...rest } = DECISION_ENV;
        expect(createService({ ...BASE_ENV, ...rest }).models()).toEqual(['fast', 'reasoning']);
      }
    });

    it('lists decision without the chat configuration', () => {
      expect(createService(DECISION_ENV).models()).toEqual(['decision']);
    });

    it('keeps the chat models when decision is not configured', () => {
      expect(createService(BASE_ENV).models()).toEqual(['fast', 'reasoning']);
    });

    it('fails at startup for an unknown decision provider', () => {
      expect(() =>
        createService({ ...DECISION_ENV, AI_PLUGIN_DECISION_PROVIDER: 'openai' })
      ).toThrow('AI_PLUGIN_DECISION_PROVIDER must be cloudflare-workers-ai');
    });

    it('fails at startup for a decision base URL that is not https', () => {
      expect(() =>
        createService({ ...DECISION_ENV, AI_PLUGIN_DECISION_BASE_URL: 'http://example.com/ai' })
      ).toThrow('AI_PLUGIN_DECISION_BASE_URL must start with https://');
    });

    it('builds a Workers AI model from the decision variables', async () => {
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            result: { answers: { q: { type: 'noul', noul: 0.5 } } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );
      const model = createService({ ...BASE_ENV, ...DECISION_ENV }).decisionModel(
        new AbortController().signal
      );
      await model.doDecide({
        state: [{ type: 'text', text: 'x' }],
        questions: { q: { type: 'boolean', instructions: 'Is it urgent?' } },
      });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${DECISION_ENV.AI_PLUGIN_DECISION_BASE_URL}/run`);
      expect(new Headers(init.headers).get('authorization')).toBe('Bearer decision-key');
      const body = sentBody();
      expect(body.model).toBe('@cf/cloudflare/clef-flash');
      expect(body).not.toHaveProperty('provider');
    });

    it('cuts the decision key out of the decision failure log', () => {
      expect(createService({ ...BASE_ENV, ...DECISION_ENV }).failureLog('decision').secret).toBe(
        'decision-key'
      );
    });
  });
});
