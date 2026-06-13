import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ADVANCED_SEARCH_CONFIG, AdvancedSearchConfig } from '../config/advanced-search.config';
import { EMBEDDING_DTYPE, EMBEDDING_MODEL, EmbeddingProvider } from './embedding-provider';

type Pipe = (
  text: string,
  opts: { pooling: string; normalize: boolean }
) => Promise<{ data: ArrayLike<number> }>;

type TransformersModule = {
  pipeline: (task: string, model: string, options?: { dtype: string }) => Promise<Pipe>;
  env: { cacheDir: string };
};

type TransformersImporter = (specifier: string) => Promise<TransformersModule>;

// Preserves native dynamic import() for the ESM-only dep under CJS compilation.
const esmImport = new Function('specifier', 'return import(specifier)') as TransformersImporter;

export const TRANSFORMERS_IMPORTER = Symbol('TRANSFORMERS_IMPORTER');

@Injectable()
export class LocalTransformersEmbeddingProvider implements EmbeddingProvider {
  private readonly logger = new Logger(LocalTransformersEmbeddingProvider.name);

  private pipelinePromise: Promise<Pipe | null> | null = null;

  constructor(
    @Inject(ADVANCED_SEARCH_CONFIG)
    private readonly config: AdvancedSearchConfig,
    @Optional()
    @Inject(TRANSFORMERS_IMPORTER)
    private readonly importer: TransformersImporter = esmImport
  ) {}

  get modelId(): string {
    return `local:${EMBEDDING_MODEL}:${EMBEDDING_DTYPE}`;
  }

  async embed(texts: string[]): Promise<(Float32Array | null)[]> {
    const pipe = await this.resolvePipeline();
    if (pipe === null) {
      return texts.map(() => null);
    }

    return Promise.all(
      texts.map(async text => {
        try {
          const result = await pipe(text, { pooling: 'mean', normalize: true });
          return new Float32Array(result.data);
        } catch {
          return null;
        }
      })
    );
  }

  private resolvePipeline(): Promise<Pipe | null> {
    if (this.pipelinePromise === null) {
      this.pipelinePromise = this.initPipeline();
    }
    return this.pipelinePromise;
  }

  private async initPipeline(): Promise<Pipe | null> {
    try {
      const transformers = await this.importer('@huggingface/transformers');
      if (this.config.modelCacheDir) {
        transformers.env.cacheDir = this.config.modelCacheDir;
      }
      return transformers.pipeline('feature-extraction', EMBEDDING_MODEL, {
        dtype: EMBEDDING_DTYPE,
      });
    } catch {
      this.logger.warn(
        '@huggingface/transformers failed to load — semantic component disabled, falling back to keyword-only search'
      );
      return null;
    }
  }
}
