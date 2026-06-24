jest.mock('@owox/internal-helpers', () => ({
  fetchWithBackoff: jest.fn(),
}));

import { fetchWithBackoff } from '@owox/internal-helpers';
import type { AdvancedSearchConfig } from '../config/advanced-search.config';
import { OpenRouterEmbeddingProvider } from './openrouter-embedding.provider';

const mockFetchWithBackoff = fetchWithBackoff as jest.MockedFunction<typeof fetchWithBackoff>;

function makeConfig(overrides: Partial<AdvancedSearchConfig> = {}): AdvancedSearchConfig {
  return {
    modelCacheDir: null,
    driftCron: '*/10 * * * *',
    topK: 3,
    indexBatchSize: 20,
    vectorCandidateMultiplier: 2,
    minRelevance: 40,
    candidateLimit: 500,
    queryMaxLength: 256,
    embeddingConcurrency: 2,
    embeddingProvider: 'openrouter',
    embeddingModel: 'google/gemini-embedding-2',
    embeddingDimensions: 768,
    openRouterApiKey: 'test-key',
    openRouterAllowedProviders: ['google-vertex'],
    openRouterDataCollection: 'deny',
    openRouterZdr: true,
    openRouterBatchingEnabled: false,
    openRouterBatchSize: 20,
    openRouterRequestTimeoutMs: 60000,
    ...overrides,
  };
}

function okResponse(data: unknown): Response {
  return {
    ok: true,
    json: jest.fn().mockResolvedValue(data),
  } as unknown as Response;
}

function httpErrorResponse(status: number, body: string): Response {
  return {
    ok: false,
    status,
    statusText: 'Error',
    text: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function expectVector(vec: Float32Array | null, expected: number[]): void {
  expect(vec).toBeInstanceOf(Float32Array);
  expect(vec).toHaveLength(expected.length);
  expected.forEach((value, index) => {
    expect((vec as Float32Array)[index]).toBeCloseTo(value, 6);
  });
}

describe('OpenRouterEmbeddingProvider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('posts batched embedding requests with model, dimensions, input type, and provider routing', async () => {
    mockFetchWithBackoff.mockResolvedValue(
      okResponse({
        data: [
          { index: 0, embedding: [3, 4, 0] },
          { index: 1, embedding: [0, 5, 0] },
        ],
      })
    );

    const provider = new OpenRouterEmbeddingProvider(
      makeConfig({ embeddingDimensions: 3, openRouterBatchingEnabled: true })
    );

    const result = await provider.embed(['first', 'second'], { inputType: 'search_document' });

    expect(mockFetchWithBackoff).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer test-key',
          'content-type': 'application/json; charset=utf-8',
        }),
      }),
      60000
    );

    const body = JSON.parse((mockFetchWithBackoff.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({
      model: 'google/gemini-embedding-2',
      input: ['first', 'second'],
      dimensions: 3,
      encoding_format: 'float',
      input_type: 'search_document',
      provider: {
        require_parameters: true,
        only: ['google-vertex'],
        order: ['google-vertex'],
        data_collection: 'deny',
        zdr: true,
      },
    });

    expect(result).toHaveLength(2);
    expectVector(result[0], [0.6, 0.8, 0]);
    expectVector(result[1], [0, 1, 0]);
  });

  it('does not batch requests by default even when OpenRouter batch size is greater than one', async () => {
    mockFetchWithBackoff
      .mockResolvedValueOnce(okResponse({ data: [{ index: 0, embedding: [1, 0] }] }))
      .mockResolvedValueOnce(okResponse({ data: [{ index: 0, embedding: [0, 1] }] }));

    const provider = new OpenRouterEmbeddingProvider(
      makeConfig({ embeddingDimensions: 2, openRouterBatchSize: 2 })
    );

    const result = await provider.embed(['first', 'second']);

    expect(mockFetchWithBackoff).toHaveBeenCalledTimes(2);
    expect(result[0]).toBeInstanceOf(Float32Array);
    expect(result[1]).toBeInstanceOf(Float32Array);

    const firstBody = JSON.parse(
      (mockFetchWithBackoff.mock.calls[0][1] as RequestInit).body as string
    );
    const secondBody = JSON.parse(
      (mockFetchWithBackoff.mock.calls[1][1] as RequestInit).body as string
    );
    expect(firstBody.input).toEqual(['first']);
    expect(secondBody.input).toEqual(['second']);
  });

  it('splits requests by configured OpenRouter batch size when batching is enabled', async () => {
    mockFetchWithBackoff
      .mockResolvedValueOnce(okResponse({ data: [{ index: 0, embedding: [1, 0] }] }))
      .mockResolvedValueOnce(okResponse({ data: [{ index: 0, embedding: [0, 1] }] }));

    const provider = new OpenRouterEmbeddingProvider(
      makeConfig({
        embeddingDimensions: 2,
        openRouterBatchingEnabled: true,
        openRouterBatchSize: 1,
      })
    );

    const result = await provider.embed(['first', 'second']);

    expect(mockFetchWithBackoff).toHaveBeenCalledTimes(2);
    expect(result[0]).toBeInstanceOf(Float32Array);
    expect(result[1]).toBeInstanceOf(Float32Array);
  });

  it('returns null for vectors whose dimension does not match the configured dimension', async () => {
    mockFetchWithBackoff.mockResolvedValue(
      okResponse({
        data: [{ index: 0, embedding: [1, 0, 0] }],
      })
    );

    const provider = new OpenRouterEmbeddingProvider(makeConfig({ embeddingDimensions: 2 }));
    const warnSpy = jest.spyOn(provider['logger'], 'warn').mockImplementation(() => undefined);

    const result = await provider.embed(['bad-dim']);

    expect(result).toEqual([null]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('expected 2'));
  });

  it('returns nulls and logs when the provider is not configured with an API key', async () => {
    const provider = new OpenRouterEmbeddingProvider(makeConfig({ openRouterApiKey: null }));
    const warnSpy = jest.spyOn(provider['logger'], 'warn').mockImplementation(() => undefined);

    const result = await provider.embed(['first', 'second']);

    expect(result).toEqual([null, null]);
    expect(mockFetchWithBackoff).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not configured'));
  });

  it('returns nulls for the failed batch when OpenRouter returns an HTTP error', async () => {
    mockFetchWithBackoff.mockResolvedValue(httpErrorResponse(429, 'rate limited'));

    const provider = new OpenRouterEmbeddingProvider(makeConfig());
    const warnSpy = jest.spyOn(provider['logger'], 'warn').mockImplementation(() => undefined);

    const result = await provider.embed(['first', 'second']);

    expect(result).toEqual([null, null]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('HTTP 429'));
  });

  it('includes provider, model, and dimension in modelId', () => {
    const provider = new OpenRouterEmbeddingProvider(
      makeConfig({ embeddingModel: 'google/custom', embeddingDimensions: 1536 })
    );

    expect(provider.modelId).toBe('openrouter:google/custom:1536');
    expect(provider.dimensions).toBe(1536);
  });
});
