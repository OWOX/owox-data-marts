import { LocalTransformersEmbeddingProvider } from './local-transformers.provider';
import { EMBEDDING_DTYPE, EMBEDDING_MODEL } from './embedding-provider';
import type { AdvancedSearchConfig } from '../config/advanced-search.config';

function makeConfig(overrides: Partial<AdvancedSearchConfig> = {}): AdvancedSearchConfig {
  return {
    modelCacheDir: null,
    reconcileCron: '*/10 * * * *',
    topK: 3,
    indexBatchSize: 20,
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
    it('returns nulls for every text, logs exactly one warning, does not re-import on second call', async () => {
      const importer = jest.fn().mockRejectedValue(new Error('ERR_MODULE_NOT_FOUND'));
      const provider = buildProvider(importer);

      const warnSpy = jest.spyOn(provider['logger'], 'warn').mockImplementation(() => undefined);

      const first = await provider.embed(['hello', 'world']);
      expect(first).toEqual([null, null]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('@huggingface/transformers failed to load')
      );

      const second = await provider.embed(['foo']);
      expect(second).toEqual([null]);

      expect(importer).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('success path', () => {
    it('returns Float32Array values, forwards pooling/normalize options, creates pipeline once', async () => {
      const fakeVec = new Float32Array([0.1, 0.2, 0.3]);
      const fakePipe = jest.fn().mockResolvedValue({ data: fakeVec });
      const fakePipelineFactory = jest.fn().mockResolvedValue(fakePipe);
      const importer = jest.fn().mockResolvedValue({ pipeline: fakePipelineFactory, env: {} });

      const provider = buildProvider(importer);

      const result = await provider.embed(['text one', 'text two']);

      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(Float32Array);
      expect(Array.from(result[0] as Float32Array)).toHaveLength(3);
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

    it('loads the hard-coded model with the quantized dtype', async () => {
      const fakePipe = jest.fn().mockResolvedValue({ data: new Float32Array([1]) });
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
      const fakePipe = jest.fn().mockResolvedValue({ data: new Float32Array([1]) });
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
      const fakePipe = jest.fn().mockResolvedValue({ data: new Float32Array([1]) });
      const importer = jest.fn().mockResolvedValue({
        pipeline: jest.fn().mockResolvedValue(fakePipe),
        env: fakeEnv,
      });

      const provider = buildProvider(importer, makeConfig({ modelCacheDir: null }));
      await provider.embed(['test']);

      expect(fakeEnv.cacheDir).toBe('original');
    });
  });

  describe('per-text inference failure', () => {
    it('returns null only for the failing element, succeeds for others', async () => {
      const fakeVec = new Float32Array([0.5, 0.6]);
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
  });

  describe('modelId', () => {
    it('namespaces the hard-coded model and dtype under local:', () => {
      const provider = buildProvider(jest.fn());
      expect(provider.modelId).toBe(`local:${EMBEDDING_MODEL}:${EMBEDDING_DTYPE}`);
    });
  });
});
