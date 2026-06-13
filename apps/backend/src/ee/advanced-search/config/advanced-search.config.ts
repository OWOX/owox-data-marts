import { z } from 'zod';

export interface AdvancedSearchConfig {
  modelCacheDir: string | null;
  reconcileCron: string;
  topK: number;
  indexBatchSize: number;
}

export const ADVANCED_SEARCH_CONFIG = Symbol('ADVANCED_SEARCH_CONFIG');

export function loadAdvancedSearchConfig(
  env: Record<string, string | undefined>
): AdvancedSearchConfig {
  const schema: z.ZodType<AdvancedSearchConfig, z.ZodTypeDef, unknown> = z.object({
    modelCacheDir: z.string().optional().nullable().default(null),
    reconcileCron: z.string().optional().default('*/10 * * * *'),
    topK: z
      .string()
      .optional()
      .default('3')
      .transform(v => parseInt(v, 10))
      .pipe(z.number().int().positive()),
    indexBatchSize: z
      .string()
      .optional()
      .default('20')
      .transform(v => parseInt(v, 10))
      .pipe(z.number().int().positive()),
  });

  return schema.parse({
    modelCacheDir: env['ADVANCED_SEARCH_MODEL_CACHE_DIR'] ?? null,
    reconcileCron: env['ADVANCED_SEARCH_RECONCILE_CRON'],
    topK: env['ADVANCED_SEARCH_TOP_K'],
    indexBatchSize: env['ADVANCED_SEARCH_INDEX_BATCH_SIZE'],
  });
}
