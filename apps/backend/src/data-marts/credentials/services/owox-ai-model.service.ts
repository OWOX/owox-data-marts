import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
  TooManyEmbeddingValuesForCallError,
  type EmbeddingModelV4,
  type EmbeddingModelV4Result,
  type LanguageModelV4,
} from '@ai-sdk/provider';
import {
  AI_PROVIDER_ENV,
  AiProviderName,
  normalizeAiProviderName,
} from '../../../common/ai-insights/services/ai-chat-provider.token';
import {
  buildOpenRouterProviderConfig,
  readOpenRouterRoutingOptions,
} from '../../../common/ai-insights/services/openrouter/openrouter-routing';

import {
  AI_MAX_RESPONSE_BODY_BYTES,
  AI_TIMEOUT_MS,
  type AiFailureLog,
} from './credential-ai.service';
import { boundResponseBody, MAX_REQUEST_BODY_BYTES } from './credential-fetch.service';

export type OwoxAiModelKey = 'fast' | 'reasoning' | 'embedding';

/** Requests in flight for one embedding call that OpenRouter must split. */
const OPENROUTER_EMBEDDING_CONCURRENCY = 8;

/**
 * Builds models from the AI configuration of the deployment.
 * Insights uses the same configuration.
 */
@Injectable()
export class OwoxAiModelService {
  constructor(private readonly config: ConfigService) {}

  models(): readonly OwoxAiModelKey[] {
    if (!this.isEnabled()) return [];
    return this.value('AI_PLUGIN_EMBEDDING_MODEL')
      ? ['fast', 'reasoning', 'embedding']
      : ['fast', 'reasoning'];
  }

  languageModel(key: 'fast' | 'reasoning', signal: AbortSignal): LanguageModelV4 {
    const modelId = this.requireModel(key);
    const fetchFn = createOwoxAiFetch(this.routing(), signal);
    if (this.isOpenRouter()) {
      return this.openRouter(fetchFn).chatModel(modelId);
    }
    return this.openAi(fetchFn).chat(modelId);
  }

  embeddingModel(signal: AbortSignal): EmbeddingModelV4 {
    const modelId = this.requireModel('embedding');
    const fetchFn = createOwoxAiFetch(this.routing(), signal);
    if (this.isOpenRouter()) {
      return oneValuePerRequest(this.openRouter(fetchFn).embeddingModel(modelId));
    }
    return this.openAi(fetchFn).embeddingModel(modelId);
  }

  /** The deployment's own provider is trusted; its key is cut out of a logged error message. */
  failureLog(key: OwoxAiModelKey): AiFailureLog {
    return {
      subject: `OWOX AI, model ${key}`,
      secret: this.value('AI_API_KEY'),
      trustedProvider: true,
    };
  }

  private openRouter(fetchFn: typeof fetch) {
    return createOpenAICompatible({
      name: 'owox-ai',
      apiKey: this.value('AI_API_KEY'),
      baseURL: this.value('AI_BASE_URL'),
      fetch: fetchFn,
      includeUsage: true,
      // Without it, the provider drops the JSON schema of a structured output.
      supportsStructuredOutputs: true,
    });
  }

  private openAi(fetchFn: typeof fetch) {
    return createOpenAI({
      apiKey: this.value('AI_API_KEY'),
      baseURL: this.value('AI_BASE_URL'),
      fetch: fetchFn,
    });
  }

  private requireModel(key: OwoxAiModelKey): string {
    if (!this.models().includes(key)) {
      throw new NotFoundException(`AI model ${key} is not available`);
    }
    return this.value(`AI_PLUGIN_${key.toUpperCase()}_MODEL`);
  }

  private isEnabled(): boolean {
    return ['AI_BASE_URL', 'AI_API_KEY', 'AI_PLUGIN_FAST_MODEL', 'AI_PLUGIN_REASONING_MODEL'].every(
      name => this.value(name)
    );
  }

  private isOpenRouter(): boolean {
    return (
      normalizeAiProviderName(this.config.get<string>(AI_PROVIDER_ENV)) ===
      AiProviderName.OPENROUTER
    );
  }

  private routing(): Record<string, unknown> | null {
    if (!this.isOpenRouter()) return null;
    // Plugin code sets sampling options, such as temperature, that some allowed endpoints do not
    // declare. With require_parameters, OpenRouter finds no endpoint for such a call. The provider
    // list, ZDR and data collection still apply.
    return {
      ...buildOpenRouterProviderConfig(readOpenRouterRoutingOptions(this.config)),
      require_parameters: false,
    };
  }

  private value(name: string): string {
    return (this.config.get<string>(name) ?? '').trim();
  }
}

/**
 * Plugin code cannot choose the routing, so this fetch overwrites any body `provider`.
 * It also caps every call at the timeout and at the request and response sizes of the
 * Credential AI path.
 */
export function createOwoxAiFetch(
  routing: Record<string, unknown> | null,
  signal: AbortSignal
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const signals = [signal, init?.signal, AbortSignal.timeout(AI_TIMEOUT_MS)].filter(
      (s): s is AbortSignal => !!s
    );
    let body = init?.body;
    if (routing) {
      // Fail closed: a body that cannot carry the routing must not go out without it.
      const parsed: unknown = typeof body === 'string' ? safeParse(body) : undefined;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('OWOX AI request body cannot carry the routing');
      }
      body = JSON.stringify({ ...parsed, provider: routing });
    }
    if (typeof body === 'string' && Buffer.byteLength(body) > MAX_REQUEST_BODY_BYTES) {
      throw new BadRequestException('Credential request body is too large');
    }
    const response = await fetch(input, { ...init, body, signal: AbortSignal.any(signals) });
    // A response that is too large is a fault of the provider, not of the plugin request.
    return boundResponseBody(
      response,
      AI_MAX_RESPONSE_BODY_BYTES,
      () => new BadGatewayException('AI provider response is too large')
    );
  }) as typeof fetch;
}

/**
 * OpenRouter does not send a batch input to Vertex embedding endpoints, and the routing allows
 * only the configured providers. One value in each request keeps the call on those providers.
 */
function oneValuePerRequest(model: EmbeddingModelV4): EmbeddingModelV4 {
  return {
    specificationVersion: model.specificationVersion,
    provider: model.provider,
    modelId: model.modelId,
    maxEmbeddingsPerCall: model.maxEmbeddingsPerCall,
    supportsParallelCalls: model.supportsParallelCalls,
    async doEmbed(options) {
      const { values } = options;
      if (values.length === 0) {
        throw new BadRequestException('An embedding call needs at least one value');
      }
      // The provider checks this limit for a batch, but each request here has one value.
      const maxEmbeddingsPerCall = await model.maxEmbeddingsPerCall;
      if (maxEmbeddingsPerCall !== undefined && values.length > maxEmbeddingsPerCall) {
        throw new TooManyEmbeddingValuesForCallError({
          provider: model.provider,
          modelId: model.modelId,
          maxEmbeddingsPerCall,
          values,
        });
      }
      // The first failure stops the other workers and cancels their requests.
      const stop = new AbortController();
      const abortSignal = options.abortSignal
        ? AbortSignal.any([options.abortSignal, stop.signal])
        : stop.signal;
      const results: EmbeddingModelV4Result[] = new Array(values.length);
      let next = 0;
      const worker = async () => {
        while (next < values.length && !stop.signal.aborted) {
          const index = next++;
          try {
            results[index] = await model.doEmbed({
              ...options,
              values: [values[index]],
              abortSignal,
            });
          } catch (error) {
            stop.abort();
            throw error;
          }
        }
      };
      const workers = Math.min(OPENROUTER_EMBEDDING_CONCURRENCY, values.length);
      await Promise.all(Array.from({ length: workers }, worker));
      return {
        embeddings: results.map(result => result.embeddings[0]),
        usage: { tokens: results.reduce((sum, result) => sum + (result.usage?.tokens ?? 0), 0) },
        warnings: results[0]?.warnings ?? [],
      };
    },
  };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
