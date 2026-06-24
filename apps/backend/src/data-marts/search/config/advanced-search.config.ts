import { z } from 'zod';
import { parseOpenRouterCommaSeparatedConfig } from '../../../common/ai-insights/services/openrouter/openrouter-routing';

export interface AdvancedSearchConfig {
  modelCacheDir: string | null;
  driftCron: string;
  topK: number;
  indexBatchSize: number;
  minRelevance: number;
  candidateLimit: number;
  vectorCandidateMultiplier: number;
  queryMaxLength: number;
  embeddingConcurrency: number;
  embeddingProvider: 'local' | 'openrouter';
  embeddingModel: string;
  embeddingDimensions: number;
  openRouterApiKey: string | null;
  openRouterAllowedProviders: string[] | null;
  openRouterDataCollection: 'allow' | 'deny';
  openRouterZdr: boolean;
  openRouterBatchingEnabled: boolean;
  openRouterBatchSize: number;
  openRouterRequestTimeoutMs: number;
}

export const ADVANCED_SEARCH_CONFIG = Symbol('ADVANCED_SEARCH_CONFIG');
export const DEFAULT_ADVANCED_SEARCH_QUERY_MAX_LENGTH = 256;

const positiveIntFromString = (defaultValue: string) =>
  z
    .string()
    .optional()
    .default(defaultValue)
    .transform(v => parseInt(v, 10))
    .pipe(z.number().int().positive());

const booleanFromString = (defaultValue: 'true' | 'false') =>
  z
    .string()
    .optional()
    .default(defaultValue)
    .transform(v => {
      const normalized = v.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
      throw new Error('Expected boolean string');
    });

const commaSeparatedList = z
  .string()
  .optional()
  .nullable()
  .transform(v => {
    const parsed = parseOpenRouterCommaSeparatedConfig(v ?? '', { toLowerCase: true });
    return parsed ? Array.from(parsed) : null;
  });

function nonBlankOrNull(value: string | undefined): string | null {
  return value && value.trim() ? value.trim() : null;
}

export function loadAdvancedSearchConfig(
  env: Record<string, string | undefined>
): AdvancedSearchConfig {
  const schema = z
    .object({
      modelCacheDir: z.string().optional().nullable().default(null),
      driftCron: z.string().optional().default('0 * * * *'),
      topK: positiveIntFromString('10'),
      indexBatchSize: positiveIntFromString('50'),
      vectorCandidateMultiplier: positiveIntFromString('2'),
      minRelevance: z
        .string()
        .optional()
        .default('45')
        .transform(v => parseInt(v, 10))
        .pipe(z.number().int().min(0)),
      candidateLimit: positiveIntFromString('500'),
      queryMaxLength: positiveIntFromString(String(DEFAULT_ADVANCED_SEARCH_QUERY_MAX_LENGTH)),
      embeddingConcurrency: positiveIntFromString('2'),
      embeddingProvider: z.enum(['local', 'openrouter']).optional().default('local'),
      embeddingModel: z.string().optional().default('google/gemini-embedding-2'),
      embeddingDimensions: positiveIntFromString('768'),
      openRouterApiKey: z.string().nullable().default(null),
      openRouterAllowedProviders: commaSeparatedList,
      openRouterDataCollection: z.enum(['allow', 'deny']).optional().default('deny'),
      openRouterZdr: booleanFromString('true'),
      openRouterBatchingEnabled: booleanFromString('false'),
      openRouterBatchSize: positiveIntFromString('20'),
      openRouterRequestTimeoutMs: positiveIntFromString('60000'),
    })
    .superRefine((value, ctx) => {
      if (value.embeddingProvider === 'openrouter' && !value.openRouterApiKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['openRouterApiKey'],
          message: 'ADVANCED_SEARCH_OPENROUTER_API_KEY is required for openrouter embeddings',
        });
      }
    });

  return schema.parse({
    modelCacheDir: env['ADVANCED_SEARCH_MODEL_CACHE_DIR'] ?? null,
    driftCron: env['ADVANCED_SEARCH_DRIFT_CRON'] ?? env['ADVANCED_SEARCH_RECONCILE_CRON'],
    topK: env['ADVANCED_SEARCH_TOP_K'],
    indexBatchSize: env['ADVANCED_SEARCH_INDEX_BATCH_SIZE'],
    vectorCandidateMultiplier: env['ADVANCED_SEARCH_VECTOR_CANDIDATE_MULTIPLIER'],
    minRelevance: env['ADVANCED_SEARCH_MIN_RELEVANCE'],
    candidateLimit: env['ADVANCED_SEARCH_CANDIDATE_LIMIT'],
    queryMaxLength: env['ADVANCED_SEARCH_QUERY_MAX_LENGTH'],
    embeddingConcurrency: env['ADVANCED_SEARCH_EMBEDDING_CONCURRENCY'],
    embeddingProvider: env['ADVANCED_SEARCH_EMBEDDING_PROVIDER'],
    embeddingModel: env['ADVANCED_SEARCH_EMBEDDING_MODEL'],
    embeddingDimensions:
      env['ADVANCED_SEARCH_EMBEDDING_DIMENSIONS'] ?? env['ADVANCED_SEARCH_EMBEDDING_DIM'],
    openRouterApiKey: nonBlankOrNull(env['ADVANCED_SEARCH_OPENROUTER_API_KEY']),
    openRouterAllowedProviders:
      env['ADVANCED_SEARCH_OPENROUTER_ALLOWED_PROVIDERS'] ?? env['AI_ALLOWED_PROVIDERS'],
    openRouterDataCollection: env['ADVANCED_SEARCH_OPENROUTER_DATA_COLLECTION'],
    openRouterZdr: env['ADVANCED_SEARCH_OPENROUTER_ZDR'],
    openRouterBatchingEnabled: env['ADVANCED_SEARCH_OPENROUTER_BATCHING_ENABLED'],
    openRouterBatchSize: env['ADVANCED_SEARCH_OPENROUTER_BATCH_SIZE'],
    openRouterRequestTimeoutMs: env['ADVANCED_SEARCH_OPENROUTER_REQUEST_TIMEOUT_MS'],
  }) as AdvancedSearchConfig;
}
