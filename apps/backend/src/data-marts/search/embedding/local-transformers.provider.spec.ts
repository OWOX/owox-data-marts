import { LocalTransformersEmbeddingProvider } from './local-transformers.provider';
import { EMBEDDING_DIMENSIONS, EMBEDDING_DTYPE, EMBEDDING_MODEL } from './embedding-provider';
import type { AdvancedSearchConfig } from '../config/advanced-search.config';

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
    embeddingProvider: 'local',
    embeddingModel: 'google/gemini-embedding-2',
    embeddingDimensions: 768,
    openRouterApiKey: null,
    openRouterAllowedProviders: null,
    openRouterDataCollection: 'deny',
    openRouterZdr: true,
    openRouterBatchingEnabled: false,
    openRouterBatchSize: 20,
    openRouterRequestTimeoutMs: 60000,
    ...overrides,
  };
}

function buildProvider(
  importer: jest.Mock,
  config: AdvancedSearchConfig = makeConfig()
): LocalTransformersEmbeddingProvider {
  return new LocalTransformersEmbeddingProvider(config, importer);
}

describe('LocalTransformersEmbeddingProvider', () => {
  describe('import failure', () => {
    it('returns nulls for every text and retries loading on the next call', async () => {
      const fakeVec = new Float32Array(EMBEDDING_DIMENSIONS).fill(0.1);
      const fakePipe = jest.fn().mockResolvedValue({ data: fakeVec });
      const fakePipelineFactory = jest.fn().mockResolvedValue(fakePipe);
      const importer = jest
        .fn()
        .mockRejectedValueOnce(new Error('ERR_MODULE_NOT_FOUND'))
        .mockResolvedValue({ pipeline: fakePipelineFactory, env: {} });
      const provider = buildProvider(importer);

      const warnSpy = jest.spyOn(provider['logger'], 'warn').mockImplementation(() => undefined);

      const first = await provider.embed(['hello', 'world']);
      expect(first).toEqual([null, null]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('@huggingface/transformers failed to load')
      );
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ERR_MODULE_NOT_FOUND'));

      const second = await provider.embed(['foo']);
      expect(second[0]).toBeInstanceOf(Float32Array);

      expect(importer).toHaveBeenCalledTimes(2);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('success path', () => {
    it('returns Float32Array values, forwards pooling/normalize options, creates pipeline once', async () => {
      const fakeVec = new Float32Array(EMBEDDING_DIMENSIONS).fill(0.1);
      fakeVec[1] = 0.2;
      fakeVec[2] = 0.3;
      const fakePipe = jest.fn().mockResolvedValue({ data: fakeVec });
      const fakePipelineFactory = jest.fn().mockResolvedValue(fakePipe);
      const importer = jest.fn().mockResolvedValue({ pipeline: fakePipelineFactory, env: {} });

      const provider = buildProvider(importer);

      const result = await provider.embed(['text one', 'text two']);

      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(Float32Array);
      expect(Array.from(result[0] as Float32Array)).toHaveLength(EMBEDDING_DIMENSIONS);
      expect((result[0] as Float32Array)[0]).toBeCloseTo(0.1, 5);
      expect((result[0] as Float32Array)[1]).toBeCloseTo(0.2, 5);
      expect((result[0] as Float32Array)[2]).toBeCloseTo(0.3, 5);
      expect(result[1]).toBeInstanceOf(Float32Array);

      expect(fakePipe).toHaveBeenCalledWith('text one', { pooling: 'mean', normalize: true });
      expect(fakePipe).toHaveBeenCalledWith('text two', { pooling: 'mean', normalize: true });

      await provider.embed(['text three']);
      expect(fakePipelineFactory).toHaveBeenCalledTimes(1);
      expect(importer).toHaveBeenCalledTimes(1);
    });

    it('returns null when the local model returns an unexpected vector dimension', async () => {
      const fakePipe = jest.fn().mockResolvedValue({ data: new Float32Array([0.1, 0.2]) });
      const fakePipelineFactory = jest.fn().mockResolvedValue(fakePipe);
      const importer = jest.fn().mockResolvedValue({ pipeline: fakePipelineFactory, env: {} });

      const provider = buildProvider(importer);
      const warnSpy = jest.spyOn(provider['logger'], 'warn').mockImplementation(() => undefined);

      const result = await provider.embed(['text']);

      expect(result).toEqual([null]);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('dimension 2'));
    });

    it('loads the hard-coded model with the quantized dtype', async () => {
      const fakePipe = jest
        .fn()
        .mockResolvedValue({ data: new Float32Array(EMBEDDING_DIMENSIONS).fill(0.1) });
      const fakePipelineFactory = jest.fn().mockResolvedValue(fakePipe);
      const importer = jest.fn().mockResolvedValue({ pipeline: fakePipelineFactory, env: {} });

      const provider = buildProvider(importer);
      await provider.embed(['test']);

      expect(fakePipelineFactory).toHaveBeenCalledWith('feature-extraction', EMBEDDING_MODEL, {
        dtype: EMBEDDING_DTYPE,
      });
    });

    it('sets cacheDir on env when modelCacheDir is configured', async () => {
      const fakeEnv = { cacheDir: '' };
      const fakePipe = jest
        .fn()
        .mockResolvedValue({ data: new Float32Array(EMBEDDING_DIMENSIONS).fill(0.1) });
      const importer = jest.fn().mockResolvedValue({
        pipeline: jest.fn().mockResolvedValue(fakePipe),
        env: fakeEnv,
      });

      const provider = buildProvider(importer, makeConfig({ modelCacheDir: '/custom/cache' }));
      await provider.embed(['test']);

      expect(fakeEnv.cacheDir).toBe('/custom/cache');
    });

    it('does not set cacheDir when modelCacheDir is null', async () => {
      const fakeEnv = { cacheDir: 'original' };
      const fakePipe = jest
        .fn()
        .mockResolvedValue({ data: new Float32Array(EMBEDDING_DIMENSIONS).fill(0.1) });
      const importer = jest.fn().mockResolvedValue({
        pipeline: jest.fn().mockResolvedValue(fakePipe),
        env: fakeEnv,
      });

      const provider = buildProvider(importer, makeConfig({ modelCacheDir: null }));
      await provider.embed(['test']);

      expect(fakeEnv.cacheDir).toBe('original');
    });

    it('limits concurrent embedding inference calls using embeddingConcurrency', async () => {
      let inFlight = 0;
      let maxInFlight = 0;
      const fakePipe = jest.fn().mockImplementation(async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise(resolve => setTimeout(resolve, 5));
        inFlight--;
        return { data: new Float32Array(EMBEDDING_DIMENSIONS).fill(0.1) };
      });
      const importer = jest.fn().mockResolvedValue({
        pipeline: jest.fn().mockResolvedValue(fakePipe),
        env: {},
      });

      const provider = buildProvider(importer, makeConfig({ embeddingConcurrency: 2 }));

      await provider.embed(['one', 'two', 'three', 'four', 'five']);

      expect(fakePipe).toHaveBeenCalledTimes(5);
      expect(maxInFlight).toBeLessThanOrEqual(2);
    });
  });

  describe('per-text inference failure', () => {
    it('returns null only for the failing element, succeeds for others', async () => {
      const fakeVec = new Float32Array(EMBEDDING_DIMENSIONS).fill(0.1);
      const fakePipe = jest
        .fn()
        .mockResolvedValueOnce({ data: fakeVec })
        .mockRejectedValueOnce(new Error('ONNX runtime error'))
        .mockResolvedValueOnce({ data: fakeVec });

      const importer = jest.fn().mockResolvedValue({
        pipeline: jest.fn().mockResolvedValue(fakePipe),
        env: {},
      });

      const provider = buildProvider(importer);
      const result = await provider.embed(['good', 'bad', 'good-too']);

      expect(result[0]).toBeInstanceOf(Float32Array);
      expect(result[1]).toBeNull();
      expect(result[2]).toBeInstanceOf(Float32Array);
    });

    it('logs the failed text index and error message when inference fails', async () => {
      const fakePipe = jest.fn().mockRejectedValue(new Error('ONNX runtime error'));
      const importer = jest.fn().mockResolvedValue({
        pipeline: jest.fn().mockResolvedValue(fakePipe),
        env: {},
      });

      const provider = buildProvider(importer);
      const warnSpy = jest.spyOn(provider['logger'], 'warn').mockImplementation(() => undefined);

      const result = await provider.embed(['bad']);

      expect(result).toEqual([null]);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('text index 0'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ONNX runtime error'));
    });
  });

  describe('modelId', () => {
    it('namespaces the hard-coded model, dtype, and dimensions under local:', () => {
      const provider = buildProvider(jest.fn());
      expect(provider.modelId).toBe(
        `local:${EMBEDDING_MODEL}:${EMBEDDING_DTYPE}:${EMBEDDING_DIMENSIONS}`
      );
    });
  });
});
