import { z } from 'zod';

export interface SearchConfig {
  queryMaxLength: number;
  queryMinLength: number;
  topK: number;
}

export const SEARCH_CONFIG = Symbol('SEARCH_CONFIG');
export const DEFAULT_SEARCH_QUERY_MAX_LENGTH = 256;
export const DEFAULT_SEARCH_QUERY_MIN_LENGTH = 2;

const positiveIntFromString = (defaultValue: string) =>
  z
    .string()
    .optional()
    .default(defaultValue)
    .transform(v => parseInt(v, 10))
    .pipe(z.number().int().positive());

export function loadSearchConfig(env: Record<string, string | undefined>): SearchConfig {
  const schema: z.ZodType<SearchConfig, z.ZodTypeDef, unknown> = z.object({
    queryMaxLength: positiveIntFromString(String(DEFAULT_SEARCH_QUERY_MAX_LENGTH)),
    queryMinLength: positiveIntFromString(String(DEFAULT_SEARCH_QUERY_MIN_LENGTH)),
    topK: positiveIntFromString('25').pipe(z.number().int().positive().max(50)),
  });

  return schema.parse({
    queryMaxLength: env['SEARCH_QUERY_MAX_LENGTH'] ?? env['ADVANCED_SEARCH_QUERY_MAX_LENGTH'],
    queryMinLength: env['SEARCH_QUERY_MIN_LENGTH'],
    topK: env['SEARCH_TOP_K'],
  });
}
