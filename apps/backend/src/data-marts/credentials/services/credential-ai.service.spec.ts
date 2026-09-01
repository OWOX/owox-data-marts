const mockDoGenerate = jest.fn();
const mockDoStream = jest.fn();
const mockDoEmbed = jest.fn();
const mockCreateOpenAI = jest.fn(
  (_options: { apiKey: string; baseURL?: string; fetch?: typeof fetch }) => ({
    chat: jest.fn(() => ({ doGenerate: mockDoGenerate, doStream: mockDoStream })),
    embeddingModel: jest.fn(() => ({ doEmbed: mockDoEmbed })),
  })
);

jest.mock('@ai-sdk/openai', () => ({ createOpenAI: mockCreateOpenAI }));
jest.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: jest.fn(() => ({
    chat: jest.fn(() => ({ doGenerate: mockDoGenerate, doStream: mockDoStream })),
  })),
}));
jest.mock('@ai-sdk/google', () => ({
  createGoogle: jest.fn(() => ({
    chat: jest.fn(() => ({ doGenerate: mockDoGenerate, doStream: mockDoStream })),
    embeddingModel: jest.fn(() => ({ doEmbed: mockDoEmbed })),
  })),
}));
jest.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: jest.fn(() => ({
    chatModel: jest.fn(() => ({ doGenerate: mockDoGenerate, doStream: mockDoStream })),
    embeddingModel: jest.fn(() => ({ doEmbed: mockDoEmbed })),
  })),
}));

import { BadRequestException } from '@nestjs/common';
import type { ResolvedCredentialBinding } from '../facades/credential-consumer-binding.facade';
import { CredentialAiService } from './credential-ai.service';

const binding = (adapter: 'openai' | 'anthropic' = 'openai'): ResolvedCredentialBinding => ({
  credentialId: 'credential-1',
  requirement: {
    key: 'ai',
    definitionId: null,
    optional: false,
    models: ['fast', 'reasoning', 'embedding'],
  },
  secret: { value: 'real-secret-that-must-not-leak' },
  definition: {
    id: adapter,
    displayName: adapter,
    description: '',
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
});
