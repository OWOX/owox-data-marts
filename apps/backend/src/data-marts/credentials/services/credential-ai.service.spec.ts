const mockDoGenerate = jest.fn();
const mockDoStream = jest.fn();
const mockDoEmbed = jest.fn();
const mockCreateOpenAI = jest.fn(
  (options: { apiKey: string; baseURL?: string; fetch?: typeof fetch }) => ({
    chat: jest.fn(() => ({ doGenerate: mockDoGenerate, doStream: mockDoStream })),
    embeddingModel: jest.fn(() => ({ doEmbed: mockDoEmbed })),
    decisionModel: (id: string) =>
      jest.requireActual('@ai-sdk/openai').createOpenAI(options).decisionModel(id),
  })
);

// Lazy: SWC hoists the imports above the mocks declared here, so the factory must not read them on load.
jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: (options: Parameters<typeof mockCreateOpenAI>[0]) => mockCreateOpenAI(options),
}));
jest.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: jest.fn((options: unknown) => ({
    chat: jest.fn(() => ({ doGenerate: mockDoGenerate, doStream: mockDoStream })),
    decisionModel: (id: string) =>
      jest.requireActual('@ai-sdk/anthropic').createAnthropic(options).decisionModel(id),
  })),
}));
jest.mock('@ai-sdk/google', () => ({
  createGoogle: jest.fn((options: unknown) => ({
    chat: jest.fn(() => ({ doGenerate: mockDoGenerate, doStream: mockDoStream })),
    embeddingModel: jest.fn(() => ({ doEmbed: mockDoEmbed })),
    decisionModel: (id: string) =>
      jest.requireActual('@ai-sdk/google').createGoogle(options).decisionModel(id),
  })),
}));
jest.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: jest.fn(() => ({
    chatModel: jest.fn(() => ({ doGenerate: mockDoGenerate, doStream: mockDoStream })),
    embeddingModel: jest.fn(() => ({ doEmbed: mockDoEmbed })),
  })),
}));

import {
  APICallError,
  Experimental_DecisionUnsupportedQuestionTypeError,
  InvalidArgumentError,
  JSONParseError,
  UnsupportedFunctionalityError,
  type Experimental_DecisionModelV4,
  type LanguageModelV4,
} from '@ai-sdk/provider';
import {
  BadGatewayException,
  BadRequestException,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import { BUILTIN_CREDENTIAL_DEFINITIONS } from './builtin-credential-definitions';
import type { ResolvedCredentialBinding } from '../facades/credential-consumer-binding.facade';
import { CredentialAiService } from './credential-ai.service';

const binding = (
  adapter: 'openai' | 'anthropic' | 'openai-compatible' = 'openai',
  definitionId: string = adapter
): ResolvedCredentialBinding => ({
  credentialId: 'credential-1',
  requirement: {
    key: 'ai',
    definitionId: null,
    optional: false,
    models: ['fast', 'reasoning', 'embedding', 'decision'],
    scopes: [],
  },
  secret: { value: 'real-secret-that-must-not-leak' },
  definition: {
    id: definitionId,
    displayName: adapter,
    description: '',
    category: 'ai',
    auth: {
      type: 'header',
      label: 'API key',
      headerName: adapter === 'anthropic' ? 'x-api-key' : 'authorization',
      ...(adapter === 'openai' ? { prefix: 'Bearer ' } : {}),
    },
    origins: [`https://api.${adapter}.example`],
    ai: { adapter, baseUrl: `https://api.${adapter}.example/v1` },
  },
  aiModelMappings: {
    fast: 'fast-model',
    reasoning: 'reasoning-model',
    embedding: 'embedding-model',
    decision: 'decision-model',
  },
});

describe('CredentialAiService', () => {
  const credentialFetch = { runRaw: jest.fn() };
  const service = new CredentialAiService(credentialFetch as never);

  beforeEach(() => {
    jest.clearAllMocks();
    credentialFetch.runRaw.mockResolvedValue(Response.json({ ok: true }));
  });

  it('runs structured generation through the mapped trusted provider model', async () => {
    mockDoGenerate.mockResolvedValue({
      content: [{ type: 'tool-call', toolCallId: 'call-1', toolName: 'lookup', input: '{}' }],
      finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
      usage: { inputTokens: { total: 2 }, outputTokens: { total: 1 }, raw: { secret: 'x' } },
      warnings: [],
      providerMetadata: { openai: { request: 'private' } },
      request: { body: { authorization: 'private' } },
    });

    const result = await service.generate(
      binding(),
      'reasoning',
      {
        prompt: [],
        responseFormat: { type: 'json', schema: { type: 'object' } },
        tools: [{ type: 'function', name: 'lookup', inputSchema: { type: 'object' } }],
        headers: { authorization: 'plugin-value' },
        providerOptions: { openai: { unsafe: true } },
      },
      new AbortController().signal
    );

    expect(mockCreateOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: expect.not.stringContaining('real-secret') })
    );
    expect(mockDoGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        responseFormat: { type: 'json', schema: { type: 'object' } },
        tools: expect.any(Array),
        includeRawChunks: false,
        abortSignal: expect.any(AbortSignal),
      })
    );
    expect(mockDoGenerate.mock.calls[0][0]).not.toHaveProperty('headers');
    expect(mockDoGenerate.mock.calls[0][0]).not.toHaveProperty('providerOptions');
    expect(JSON.stringify(result)).not.toMatch(
      /real-secret|providerMetadata|authorization|private/
    );
  });

  it('generate delegates to generateWith with the Credential model', async () => {
    const generateWith = jest.spyOn(service, 'generateWith').mockResolvedValue({ ok: true });
    const signal = new AbortController().signal;

    await expect(service.generate(binding(), 'fast', { prompt: [] }, signal)).resolves.toEqual({
      ok: true,
    });

    expect(generateWith).toHaveBeenCalledWith(
      expect.objectContaining({ doGenerate: mockDoGenerate }),
      { prompt: [] },
      signal,
      expect.objectContaining({ subject: expect.stringMatching(/^Credential .+, model fast$/) })
    );
    generateWith.mockRestore();
  });

  it('uses the guarded Credential fetch as the provider package transport', async () => {
    mockDoGenerate.mockResolvedValue({
      content: [],
      finishReason: { unified: 'stop' },
      usage: {},
      warnings: [],
    });
    const selected = binding();
    await service.generate(selected, 'fast', { prompt: [] }, new AbortController().signal);
    const trustedFetch = mockCreateOpenAI.mock.calls[0][0].fetch as typeof fetch;

    await trustedFetch('https://api.openai.example/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: 'Bearer placeholder', 'content-type': 'application/json' },
      body: '{}',
    });

    expect(credentialFetch.runRaw).toHaveBeenCalledWith(
      selected,
      expect.objectContaining({
        url: 'https://api.openai.example/v1/chat/completions',
        method: 'POST',
        bodyBase64: Buffer.from('{}').toString('base64'),
      }),
      expect.objectContaining({ timeoutMs: 120_000, signal: expect.any(AbortSignal) })
    );
  });

  describe('a failed provider call', () => {
    let warn: jest.SpyInstance;
    const providerError = (message: string, statusCode = 404) =>
      new APICallError({
        message,
        url: 'https://api.openai.example/v1/chat/completions',
        requestBodyValues: { prompt: 'private data mart rows' },
        responseBody: 'private response body',
        statusCode,
      });
    const generate = (target = binding()) =>
      service.generate(target, 'fast', { prompt: [] }, new AbortController().signal);
    /** Everything the log received, so a second argument (the error object) is caught too. */
    const loggedText = () => JSON.stringify(warn.mock.calls);

    beforeEach(() => {
      warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => {
      warn.mockRestore();
    });

    it('logs what a built-in provider answered, and gives the plugin a generic 502', async () => {
      mockDoGenerate.mockRejectedValue(providerError('model: fast-model not found'));

      const failure = await generate().catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(BadGatewayException);
      expect((failure as Error).message).toBe('AI provider request could not be completed');
      // A cause would put the request into GlobalExceptionFilter's log of the 502.
      expect((failure as Error).cause).toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        'AI provider request failed for Credential credential-1, model fast (HTTP 404): model: fast-model not found'
      );
      expect(loggedText()).not.toContain('private');
    });

    it('cuts the secret out of a provider message that echoes it', async () => {
      mockDoGenerate.mockRejectedValue(
        providerError('Incorrect API key provided: real-secret-that-must-not-leak', 401)
      );

      await expect(generate()).rejects.toThrow(BadGatewayException);

      expect(loggedText()).toContain('(HTTP 401): Incorrect API key provided: [redacted]');
      expect(loggedText()).not.toContain('real-secret-that-must-not-leak');
    });

    it('logs a call without a Credential under the subject and secret its caller gives', async () => {
      const model = {
        doGenerate: jest
          .fn()
          .mockRejectedValue(providerError('No endpoints for key deployment-key-1234', 404)),
      } as unknown as LanguageModelV4;

      await expect(
        service.generateWith(model, { prompt: [] }, new AbortController().signal, {
          subject: 'OWOX AI, model fast',
          secret: 'deployment-key-1234',
          trustedProvider: true,
        })
      ).rejects.toThrow(BadGatewayException);

      expect(warn).toHaveBeenCalledWith(
        'AI provider request failed for OWOX AI, model fast (HTTP 404): No endpoints for key [redacted]'
      );
    });

    // Any server an external definition names may echo the request or the key back.
    it("logs only the status of a third-party server's answer", async () => {
      mockDoGenerate.mockRejectedValue(
        providerError("1 validation error: input_value='private data mart rows'", 400)
      );

      await expect(generate(binding('openai-compatible', '@acme/gateway'))).rejects.toThrow(
        BadGatewayException
      );

      expect(warn).toHaveBeenCalledWith(
        'AI provider request failed for Credential credential-1, model fast (HTTP 400): AI_APICallError'
      );
      expect(loggedText()).not.toContain('private');
    });

    it("logs only the name of an SDK error whose message holds the model's output", async () => {
      mockDoGenerate.mockRejectedValue(
        new JSONParseError({ text: 'private model output', cause: new Error('bad json') })
      );

      await expect(generate()).rejects.toThrow(BadGatewayException);

      expect(warn).toHaveBeenCalledWith(
        'AI provider request failed for Credential credential-1, model fast: AI_JSONParseError'
      );
      expect(loggedText()).not.toContain('private');
    });

    it('keeps the first 500 characters of a long provider message', async () => {
      mockDoGenerate.mockRejectedValue(providerError('x'.repeat(2000)));

      await expect(generate()).rejects.toThrow(BadGatewayException);

      expect(loggedText()).toContain(`(HTTP 404): ${'x'.repeat(500)}`);
      expect(loggedText()).not.toContain('x'.repeat(501));
    });

    // The guarded fetch words a timeout or a refused connection itself, before the SDK sees it.
    it('logs a timeout or a refused connection, and gives the plugin the same 502', async () => {
      mockDoGenerate.mockRejectedValue(
        new BadGatewayException('Credential request could not be completed')
      );

      await expect(generate()).rejects.toThrow('AI provider request could not be completed');

      expect(warn).toHaveBeenCalledWith(
        'AI provider request failed for Credential credential-1, model fast: Credential request could not be completed'
      );
    });

    it('passes our own refusals through without logging them as provider failures', async () => {
      const refusal = new BadRequestException('No model is mapped to fast');
      mockDoGenerate.mockRejectedValue(refusal);

      await expect(generate()).rejects.toBe(refusal);

      expect(warn).not.toHaveBeenCalled();
    });

    it.each([
      ['generate', () => generate()],
      [
        'stream',
        () => service.stream(binding(), 'fast', { prompt: [] }, new AbortController().signal),
      ],
      [
        'embed',
        () =>
          service.embed(
            binding(),
            'embedding',
            { values: ['hello'] },
            new AbortController().signal
          ),
      ],
    ])('handles a provider failure the same way in %s', async (_method, call) => {
      const failure = providerError('upstream unavailable', 503);
      mockDoGenerate.mockRejectedValue(failure);
      mockDoStream.mockRejectedValue(failure);
      mockDoEmbed.mockRejectedValue(failure);

      await expect(call()).rejects.toThrow('AI provider request could not be completed');

      expect(warn).toHaveBeenCalledTimes(1);
      expect(loggedText()).toContain('(HTTP 503): upstream unavailable');
    });
  });

  it('passes streaming tool parts and normalizes provider stream errors', async () => {
    mockDoStream.mockResolvedValue({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'lookup',
            input: '{}',
            providerMetadata: { openai: { private: true } },
          });
          controller.enqueue({ type: 'raw', rawValue: { secret: true } });
          controller.enqueue({ type: 'error', error: new Error('Bearer provider-secret') });
          controller.close();
        },
      }),
    });

    const stream = await service.stream(
      binding(),
      'fast',
      { prompt: [] },
      new AbortController().signal
    );
    const reader = stream.getReader();
    await expect(reader.read()).resolves.toMatchObject({
      value: { type: 'tool-call', toolName: 'lookup' },
    });
    await expect(reader.read()).resolves.toEqual({
      done: false,
      value: {
        type: 'error',
        error: { name: 'Error', message: 'AI provider request failed' },
      },
    });
    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
  });

  it('supports embeddings and refuses an unsupported Anthropic embedding adapter', async () => {
    mockDoEmbed.mockResolvedValue({ embeddings: [[0.1, 0.2]], usage: { tokens: 1 }, warnings: [] });
    await expect(
      service.embed(binding(), 'embedding', { values: ['hello'] }, new AbortController().signal)
    ).resolves.toMatchObject({ embeddings: [[0.1, 0.2]] });
    await expect(
      service.embed(
        binding('anthropic'),
        'embedding',
        { values: ['hello'] },
        new AbortController().signal
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('decisions', () => {
    const signal = () => new AbortController().signal;
    const question = { type: 'choice', criteria: { a: null, b: null }, instructions: 'pick' };
    const decisionModel = (supportedQuestionTypes: string[] = ['choice', 'score', 'boolean']) => {
      const doDecide = jest.fn();
      const model = {
        specificationVersion: 'v4',
        provider: 'p',
        modelId: 'm',
        supportedQuestionTypes,
        doDecide,
      } as unknown as Experimental_DecisionModelV4;
      return { model, doDecide };
    };
    const failureLog = { subject: 'test', secret: 'x', trustedProvider: true };

    it('decides and returns the sanitized result', async () => {
      const { model, doDecide } = decisionModel();
      doDecide.mockResolvedValue({
        answers: { q: { type: 'choice', choice: 'a' } },
        usage: { inputTokens: 1, outputTokens: 2 },
        warnings: [],
        providerMetadata: { openai: { private: true } },
        response: { id: 'resp-1', modelId: 'secret-model' },
      });
      const abort = new AbortController();

      const result = await service.decideWith(
        model,
        { state: [], questions: { q: question }, headers: { a: 'b' }, providerOptions: { x: {} } },
        abort.signal,
        failureLog
      );

      const options = doDecide.mock.calls[0][0];
      expect(options).not.toHaveProperty('headers');
      expect(options).not.toHaveProperty('providerOptions');
      expect(options.abortSignal).toBe(abort.signal);
      expect(result).toEqual({
        answers: { q: { type: 'choice', choice: 'a' } },
        usage: { inputTokens: 1, outputTokens: 2 },
        warnings: [],
      });
    });

    it('rejects an unsupported question type with 400 before the call', async () => {
      const { model, doDecide } = decisionModel(['choice']);
      const call = service.decideWith(
        model,
        { state: [], questions: { urgent: { type: 'boolean', instructions: 'x' } } },
        signal(),
        failureLog
      );
      await expect(call).rejects.toBeInstanceOf(BadRequestException);
      await expect(call).rejects.toThrow(/urgent.*boolean/);
      expect(doDecide).not.toHaveBeenCalled();
    });

    it.each([
      ['a missing questions map', { state: [] }],
      ['a null question entry', { state: [], questions: { q: null } }],
      ['a state that is not a list', { state: 'text', questions: { q: question } }],
    ])('rejects %s with 400 before the call', async (_name, options) => {
      const { model, doDecide } = decisionModel();
      await expect(service.decideWith(model, options, signal(), failureLog)).rejects.toBeInstanceOf(
        BadRequestException
      );
      expect(doDecide).not.toHaveBeenCalled();
    });

    it.each([
      ['empty questions', { state: [], questions: {} }],
      ['a null state part', { state: [null], questions: { q: question } }],
      ['a text part without text', { state: [{ type: 'text' }], questions: { q: question } }],
      ['an unknown state part', { state: [{ type: 'image' }], questions: { q: question } }],
      [
        'missing instructions',
        { state: [], questions: { q: { ...question, instructions: undefined } } },
      ],
      ['blank instructions', { state: [], questions: { q: { ...question, instructions: '  ' } } }],
      [
        'empty object instructions',
        { state: [], questions: { q: { ...question, instructions: {} } } },
      ],
      [
        'empty list instructions',
        { state: [], questions: { q: { ...question, instructions: [] } } },
      ],
      [
        'a choice with one option',
        { state: [], questions: { q: { ...question, criteria: { a: null } } } },
      ],
      [
        'a choice with list criteria',
        { state: [], questions: { q: { ...question, criteria: ['a', 'b'] } } },
      ],
      [
        'a score with one level',
        { state: [], questions: { q: { type: 'score', instructions: 'rate', criteria: ['low'] } } },
      ],
      [
        'a score with an empty level',
        {
          state: [],
          questions: { q: { type: 'score', instructions: 'rate', criteria: ['low', ''] } },
        },
      ],
      [
        'boolean criteria that are not an object',
        { state: [], questions: { q: { type: 'boolean', instructions: 'x', criteria: 'yes' } } },
      ],
    ])('rejects %s with 400 for every route, before the call', async (_name, options) => {
      const { model, doDecide } = decisionModel();
      const error = await service
        .decideWith(model, options, signal(), failureLog)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as Error).message).not.toMatch(/OWOX|openai|gemini|anthropic/i);
      expect(doDecide).not.toHaveBeenCalled();
    });

    it('accepts object instructions, and a string that only looks like JSON', async () => {
      const { model, doDecide } = decisionModel();
      doDecide.mockResolvedValue({ answers: {}, usage: {}, warnings: [] });
      await service.decideWith(
        model,
        {
          state: [{ type: 'json', value: null }],
          questions: {
            a: { ...question, instructions: { goal: 'pick' } },
            b: { ...question, instructions: '{}' },
            c: { type: 'boolean', instructions: 'x', criteria: null },
          },
        },
        signal(),
        failureLog
      );
      expect(doDecide).toHaveBeenCalledTimes(1);
    });

    it.each([
      [
        'InvalidArgumentError',
        new InvalidArgumentError({ argument: 'questions', message: 'Google Decisions requires x' }),
      ],
      [
        'UnsupportedFunctionalityError',
        new UnsupportedFunctionalityError({ functionality: 'OpenAI decision image media type' }),
      ],
    ])('maps %s from the provider SDK to a neutral 400', async (_name, sdkError) => {
      const { model, doDecide } = decisionModel();
      doDecide.mockRejectedValue(sdkError);
      const error = await service
        .decideWith(model, { state: [], questions: { q: question } }, signal(), failureLog)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as Error).message).toBe(
        'The selected AI model cannot run this decision request'
      );
    });

    it('maps DecisionUnsupportedQuestionTypeError to 400', async () => {
      const { model, doDecide } = decisionModel();
      doDecide.mockRejectedValue(
        new Experimental_DecisionUnsupportedQuestionTypeError({
          questionId: 'urgent',
          questionType: 'boolean',
          provider: 'p',
          modelId: 'm',
        })
      );
      const call = service.decideWith(
        model,
        { state: [], questions: { urgent: { type: 'boolean', instructions: 'x' } } },
        signal(),
        failureLog
      );
      await expect(call).rejects.toBeInstanceOf(BadRequestException);
      await expect(call).rejects.toThrow(/urgent.*boolean/);
    });

    it('lets a 413 from the model reach the plugin', async () => {
      const { model, doDecide } = decisionModel();
      doDecide.mockRejectedValue(new PayloadTooLargeException('too big'));
      await expect(
        service.decideWith(model, { state: [], questions: { q: question } }, signal(), failureLog)
      ).rejects.toMatchObject({ status: 413 });
    });

    it('sends OpenAI, Gemini and Anthropic decision calls through the trusted fetch', async () => {
      for (const id of ['openai', 'gemini', 'anthropic']) {
        const definition = BUILTIN_CREDENTIAL_DEFINITIONS.find(item => item.id === id)!;
        credentialFetch.runRaw.mockReset();
        credentialFetch.runRaw.mockRejectedValue(new BadGatewayException('down'));
        const target = {
          ...binding(),
          definition,
          aiModelMappings: { fast: 'f', reasoning: 'r', decision: 'd' },
        } as ResolvedCredentialBinding;

        await expect(
          service.decide(
            target,
            'decision',
            { state: [{ type: 'text', text: 'hi' }], questions: { q: question } },
            signal()
          )
        ).rejects.toMatchObject({ status: 502 });

        expect(credentialFetch.runRaw).toHaveBeenCalledTimes(1);
        expect(credentialFetch.runRaw.mock.calls[0][1].url.startsWith(definition.ai!.baseUrl)).toBe(
          true
        );
      }
    });

    it.each(['openrouter', 'openai-compatible'] as const)(
      'rejects decision for %s Credentials with a neutral 400',
      async adapter => {
        const base = binding();
        const target = {
          ...base,
          definition: { ...base.definition, ai: { adapter, baseUrl: 'https://x.example/v1' } },
        } as ResolvedCredentialBinding;
        const call = service.decide(target, 'decision', { state: [], questions: {} }, signal());
        await expect(call).rejects.toThrow(
          'The selected Credential does not support decision models'
        );
        await expect(call).rejects.not.toThrow(/openrouter|openai-compatible/);
      }
    );

    it('answers 400 when the decision mapping is not configured', async () => {
      const target = { ...binding(), aiModelMappings: { fast: 'f' } } as ResolvedCredentialBinding;
      await expect(
        service.decide(target, 'decision', { state: [], questions: {} }, signal())
      ).rejects.toThrow('AI model mapping decision is not configured');
    });
  });
});
