import { Inject, Injectable, Logger } from '@nestjs/common';
import { fetchWithBackoff } from '@owox/internal-helpers';
import { ADVANCED_SEARCH_CONFIG, AdvancedSearchConfig } from '../config/advanced-search.config';
import { EmbeddingOptions, EmbeddingProvider } from './embedding-provider';
import { normalizeVec } from './vector-codec';
import { buildOpenRouterProviderConfig } from '../../../common/ai-insights/services/openrouter/openrouter-routing';

type OpenRouterEmbeddingItem = {
  index?: number;
  embedding?: unknown;
};

type OpenRouterEmbeddingResponse = {
  data?: OpenRouterEmbeddingItem[];
};

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

@Injectable()
export class OpenRouterEmbeddingProvider implements EmbeddingProvider {
  private readonly logger = new Logger(OpenRouterEmbeddingProvider.name);

  constructor(
    @Inject(ADVANCED_SEARCH_CONFIG)
    private readonly config: AdvancedSearchConfig
  ) {}

  get modelId(): string {
    return `openrouter:${this.config.embeddingModel}:${this.config.embeddingDimensions}`;
  }

  get dimensions(): number {
    return this.config.embeddingDimensions;
  }

  async embed(texts: string[], options?: EmbeddingOptions): Promise<(Float32Array | null)[]> {
    if (texts.length === 0) return [];
    if (!this.config.openRouterApiKey) {
      this.logger.warn(
        'OpenRouter embedding provider is not configured; entity will not be indexed and search will fail closed'
      );
      return texts.map(() => null);
    }

    const results: (Float32Array | null)[] = new Array(texts.length).fill(null);
    const batchSize = this.config.openRouterBatchingEnabled
      ? Math.max(1, this.config.openRouterBatchSize)
      : 1;

    for (let offset = 0; offset < texts.length; offset += batchSize) {
      const batch = texts.slice(offset, offset + batchSize);
      await this.embedBatch(batch, offset, results, options);
    }

    return results;
  }

  private async embedBatch(
    texts: string[],
    offset: number,
    results: (Float32Array | null)[],
    options?: EmbeddingOptions
  ): Promise<void> {
    try {
      const response = await fetchWithBackoff(
        `${OPENROUTER_BASE_URL}/embeddings`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json; charset=utf-8',
            authorization: `Bearer ${this.config.openRouterApiKey}`,
          },
          body: JSON.stringify(this.buildRequestBody(texts, options)),
        },
        this.config.openRouterRequestTimeoutMs
      );

      if (!response.ok) {
        const body = await response.text();
        this.logger.warn(
          `OpenRouter embedding request failed with HTTP ${response.status}; batch will not be indexed: ${body}`
        );
        return;
      }

      const payload = (await response.json()) as OpenRouterEmbeddingResponse;
      this.applyEmbeddingResponse(payload, offset, texts.length, results);
    } catch (err) {
      this.logger.warn(
        `OpenRouter embedding request failed; batch will not be indexed: ${this.formatError(err)}`
      );
    }
  }

  private buildRequestBody(texts: string[], options?: EmbeddingOptions): Record<string, unknown> {
    return {
      model: this.config.embeddingModel,
      input: texts,
      dimensions: this.config.embeddingDimensions,
      encoding_format: 'float',
      ...(options?.inputType ? { input_type: options.inputType } : {}),
      provider: buildOpenRouterProviderConfig({
        allowedProviders: this.config.openRouterAllowedProviders,
        dataCollection: this.config.openRouterDataCollection,
        zdr: this.config.openRouterZdr,
      }),
    };
  }

  private applyEmbeddingResponse(
    payload: OpenRouterEmbeddingResponse,
    offset: number,
    batchLength: number,
    results: (Float32Array | null)[]
  ): void {
    if (!Array.isArray(payload.data)) {
      this.logger.warn('OpenRouter embedding response did not contain a data array');
      return;
    }

    payload.data.forEach((item, position) => {
      const relativeIndex = typeof item.index === 'number' ? item.index : position;
      if (relativeIndex < 0 || relativeIndex >= batchLength) {
        this.logger.warn(`OpenRouter embedding response contained invalid index ${relativeIndex}`);
        return;
      }

      const vec = this.toNormalizedVector(item.embedding, offset + relativeIndex);
      results[offset + relativeIndex] = vec;
    });
  }

  private toNormalizedVector(value: unknown, resultIndex: number): Float32Array | null {
    if (!Array.isArray(value)) {
      this.logger.warn(`OpenRouter embedding ${resultIndex} is not an array`);
      return null;
    }

    const numbers = value.map(item => (typeof item === 'number' ? item : Number(item)));
    if (numbers.some(item => !Number.isFinite(item))) {
      this.logger.warn(`OpenRouter embedding ${resultIndex} contains non-finite values`);
      return null;
    }

    if (numbers.length !== this.config.embeddingDimensions) {
      this.logger.warn(
        `OpenRouter embedding ${resultIndex} has dimension ${numbers.length}, expected ${this.config.embeddingDimensions}`
      );
      return null;
    }

    const normalized = normalizeVec(new Float32Array(numbers));
    if (normalized === null) {
      this.logger.warn(`OpenRouter embedding ${resultIndex} could not be normalized`);
    }
    return normalized;
  }

  private formatError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
