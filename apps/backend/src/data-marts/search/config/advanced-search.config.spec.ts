import { loadAdvancedSearchConfig } from './advanced-search.config';

describe('loadAdvancedSearchConfig', () => {
  it('returns defaults when env is empty', () => {
    const config = loadAdvancedSearchConfig({});
    expect(config.modelCacheDir).toBeNull();
    expect(config.driftCron).toBe('0 * * * *');
    expect(config.vectorCandidateMultiplier).toBe(2);
    expect(config.topK).toBe(10);
    expect(config.indexBatchSize).toBe(50);
    expect(config.minRelevance).toBe(45);
    expect(config.candidateLimit).toBe(500);
    expect(config.queryMaxLength).toBe(256);
    expect(config.embeddingConcurrency).toBe(2);
    expect(config.embeddingProvider).toBe('local');
    expect(config.embeddingModel).toBe('google/gemini-embedding-2');
    expect(config.embeddingDimensions).toBe(768);
    expect(config.openRouterApiKey).toBeNull();
    expect(config.openRouterAllowedProviders).toBeNull();
    expect(config.openRouterDataCollection).toBe('deny');
    expect(config.openRouterZdr).toBe(true);
    expect(config.openRouterBatchingEnabled).toBe(false);
    expect(config.openRouterBatchSize).toBe(20);
    expect(config.openRouterRequestTimeoutMs).toBe(60000);
  });

  it('applies custom minRelevance and allows zero (filter disabled)', () => {
    expect(loadAdvancedSearchConfig({ ADVANCED_SEARCH_MIN_RELEVANCE: '55' }).minRelevance).toBe(55);
    expect(loadAdvancedSearchConfig({ ADVANCED_SEARCH_MIN_RELEVANCE: '0' }).minRelevance).toBe(0);
  });

  it('rejects negative minRelevance', () => {
    expect(() => loadAdvancedSearchConfig({ ADVANCED_SEARCH_MIN_RELEVANCE: '-5' })).toThrow();
  });

  it('applies custom cache dir', () => {
    const config = loadAdvancedSearchConfig({ ADVANCED_SEARCH_MODEL_CACHE_DIR: '/data/models' });
    expect(config.modelCacheDir).toBe('/data/models');
  });

  it('applies custom drift cron via ADVANCED_SEARCH_DRIFT_CRON', () => {
    const config = loadAdvancedSearchConfig({ ADVANCED_SEARCH_DRIFT_CRON: '*/5 * * * *' });
    expect(config.driftCron).toBe('*/5 * * * *');
  });

  it('falls back to ADVANCED_SEARCH_RECONCILE_CRON when DRIFT_CRON is not set', () => {
    const config = loadAdvancedSearchConfig({ ADVANCED_SEARCH_RECONCILE_CRON: '*/5 * * * *' });
    expect(config.driftCron).toBe('*/5 * * * *');
  });

  it('applies custom vectorCandidateMultiplier', () => {
    const config = loadAdvancedSearchConfig({ ADVANCED_SEARCH_VECTOR_CANDIDATE_MULTIPLIER: '4' });
    expect(config.vectorCandidateMultiplier).toBe(4);
  });

  it('applies custom topK and indexBatchSize', () => {
    const config = loadAdvancedSearchConfig({
      ADVANCED_SEARCH_TOP_K: '10',
      ADVANCED_SEARCH_INDEX_BATCH_SIZE: '50',
    });
    expect(config.topK).toBe(10);
    expect(config.indexBatchSize).toBe(50);
  });

  it('applies custom candidateLimit, queryMaxLength, and embeddingConcurrency', () => {
    const config = loadAdvancedSearchConfig({
      ADVANCED_SEARCH_CANDIDATE_LIMIT: '250',
      ADVANCED_SEARCH_QUERY_MAX_LENGTH: '128',
      ADVANCED_SEARCH_EMBEDDING_CONCURRENCY: '4',
    });

    expect(config.candidateLimit).toBe(250);
    expect(config.queryMaxLength).toBe(128);
    expect(config.embeddingConcurrency).toBe(4);
  });

  it('applies OpenRouter embedding configuration', () => {
    const config = loadAdvancedSearchConfig({
      ADVANCED_SEARCH_EMBEDDING_PROVIDER: 'openrouter',
      ADVANCED_SEARCH_EMBEDDING_MODEL: 'google/custom-embedding',
      ADVANCED_SEARCH_EMBEDDING_DIMENSIONS: '1536',
      ADVANCED_SEARCH_OPENROUTER_API_KEY: 'advanced-key',
      ADVANCED_SEARCH_OPENROUTER_ALLOWED_PROVIDERS: 'google-vertex, openai',
      ADVANCED_SEARCH_OPENROUTER_DATA_COLLECTION: 'allow',
      ADVANCED_SEARCH_OPENROUTER_ZDR: 'false',
      ADVANCED_SEARCH_OPENROUTER_BATCHING_ENABLED: 'true',
      ADVANCED_SEARCH_OPENROUTER_BATCH_SIZE: '7',
      ADVANCED_SEARCH_OPENROUTER_REQUEST_TIMEOUT_MS: '12345',
    });

    expect(config.embeddingProvider).toBe('openrouter');
    expect(config.embeddingModel).toBe('google/custom-embedding');
    expect(config.embeddingDimensions).toBe(1536);
    expect(config.openRouterApiKey).toBe('advanced-key');
    expect(config.openRouterAllowedProviders).toEqual(['google-vertex', 'openai']);
    expect(config.openRouterDataCollection).toBe('allow');
    expect(config.openRouterZdr).toBe(false);
    expect(config.openRouterBatchingEnabled).toBe(true);
    expect(config.openRouterBatchSize).toBe(7);
    expect(config.openRouterRequestTimeoutMs).toBe(12345);
  });

  it('reuses common OpenRouter provider routing when embedding-specific providers are not set', () => {
    const config = loadAdvancedSearchConfig({
      ADVANCED_SEARCH_EMBEDDING_PROVIDER: 'openrouter',
      ADVANCED_SEARCH_OPENROUTER_API_KEY: 'advanced-key',
      AI_ALLOWED_PROVIDERS: 'google-vertex, azure',
    });

    expect(config.openRouterAllowedProviders).toEqual(['google-vertex', 'azure']);
  });

  it('prefers embedding-specific OpenRouter provider routing over common AI_ALLOWED_PROVIDERS', () => {
    const config = loadAdvancedSearchConfig({
      ADVANCED_SEARCH_EMBEDDING_PROVIDER: 'openrouter',
      ADVANCED_SEARCH_OPENROUTER_API_KEY: 'advanced-key',
      ADVANCED_SEARCH_OPENROUTER_ALLOWED_PROVIDERS: 'google-ai-studio',
      AI_ALLOWED_PROVIDERS: 'google-vertex, azure',
    });

    expect(config.openRouterAllowedProviders).toEqual(['google-ai-studio']);
  });

  it('rejects openrouter provider without an embedding API key', () => {
    expect(() =>
      loadAdvancedSearchConfig({
        ADVANCED_SEARCH_EMBEDDING_PROVIDER: 'openrouter',
      })
    ).toThrow();
  });

  it('does not reuse generic AI_API_KEY as an OpenRouter embedding key', () => {
    expect(() =>
      loadAdvancedSearchConfig({
        ADVANCED_SEARCH_EMBEDDING_PROVIDER: 'openrouter',
        AI_API_KEY: 'shared-ai-key',
      })
    ).toThrow();
  });

  it('rejects non-numeric topK', () => {
    expect(() => loadAdvancedSearchConfig({ ADVANCED_SEARCH_TOP_K: 'abc' })).toThrow();
  });

  it('rejects non-numeric indexBatchSize', () => {
    expect(() => loadAdvancedSearchConfig({ ADVANCED_SEARCH_INDEX_BATCH_SIZE: 'xyz' })).toThrow();
  });

  it('rejects zero topK', () => {
    expect(() => loadAdvancedSearchConfig({ ADVANCED_SEARCH_TOP_K: '0' })).toThrow();
  });

  it('rejects negative indexBatchSize', () => {
    expect(() => loadAdvancedSearchConfig({ ADVANCED_SEARCH_INDEX_BATCH_SIZE: '-1' })).toThrow();
  });

  it('rejects zero candidateLimit', () => {
    expect(() => loadAdvancedSearchConfig({ ADVANCED_SEARCH_CANDIDATE_LIMIT: '0' })).toThrow();
  });

  it('rejects zero queryMaxLength', () => {
    expect(() => loadAdvancedSearchConfig({ ADVANCED_SEARCH_QUERY_MAX_LENGTH: '0' })).toThrow();
  });

  it('rejects zero embeddingConcurrency', () => {
    expect(() =>
      loadAdvancedSearchConfig({ ADVANCED_SEARCH_EMBEDDING_CONCURRENCY: '0' })
    ).toThrow();
  });

  it('rejects unknown embedding providers', () => {
    expect(() =>
      loadAdvancedSearchConfig({ ADVANCED_SEARCH_EMBEDDING_PROVIDER: 'unknown' })
    ).toThrow();
  });

  it('rejects zero embedding dimensions', () => {
    expect(() => loadAdvancedSearchConfig({ ADVANCED_SEARCH_EMBEDDING_DIMENSIONS: '0' })).toThrow();
  });
});
