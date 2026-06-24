import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ADVANCED_SEARCH_CONFIG, AdvancedSearchConfig } from '../config/advanced-search.config';
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_DTYPE,
  EMBEDDING_MODEL,
  EmbeddingOptions,
  EmbeddingProvider,
} from './embedding-provider';

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
    return `local:${EMBEDDING_MODEL}:${EMBEDDING_DTYPE}:${EMBEDDING_DIMENSIONS}`;
  }

  get dimensions(): number {
    return EMBEDDING_DIMENSIONS;
  }

  async embed(texts: string[], _options?: EmbeddingOptions): Promise<(Float32Array | null)[]> {
    const pipe = await this.resolvePipeline();
    if (pipe === null) {
      return texts.map(() => null);
    }

    const results: (Float32Array | null)[] = new Array(texts.length).fill(null);
    let nextIndex = 0;
    const workerCount = Math.min(this.config.embeddingConcurrency, texts.length);

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (nextIndex < texts.length) {
          const index = nextIndex++;
          results[index] = await this.embedOne(pipe, texts[index], index);
        }
      })
    );

    return results;
  }

  private async embedOne(pipe: Pipe, text: string, index: number): Promise<Float32Array | null> {
    try {
      const result = await pipe(text, { pooling: 'mean', normalize: true });
      const vec = new Float32Array(result.data);
      if (vec.length !== EMBEDDING_DIMENSIONS) {
        this.logger.warn(
          `Embedding inference returned dimension ${vec.length}, expected ${EMBEDDING_DIMENSIONS}; entity will not be indexed`
        );
        return null;
      }
      return vec;
    } catch (err) {
      this.logger.warn(
        `Embedding inference failed for text index ${index}; entity will not be indexed: ${this.formatError(err)}`
      );
      return null;
    }
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
    } catch (err) {
      this.logger.warn(
        `@huggingface/transformers failed to load — embedding unavailable, search and indexing will fail closed: ${this.formatError(err)}`
      );
      return null;
    }
  }

  private formatError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
