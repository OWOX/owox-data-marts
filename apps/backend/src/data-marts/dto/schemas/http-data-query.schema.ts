import { z } from 'zod';
import { FilterConfigSchema } from './filter-config.schema';
import { SortConfigSchema } from './sort-config.schema';

export const HTTP_DATA_MAX_ENCODED_PARAM_LENGTH = 8192;

export const ALL_NATIVE_COLUMNS = '*';
export const ALL_BLENDABLE_COLUMNS = '**';

export type ColumnSelector =
  | { mode: 'allNative'; explicit: string[] }
  | { mode: 'allBlendable' }
  | { mode: 'explicit'; explicit: string[] };

const REJECTED_PAGINATION_KEYS = ['pageToken', 'offset'] as const;

type ColumnSetSelector = typeof ALL_NATIVE_COLUMNS | typeof ALL_BLENDABLE_COLUMNS;

function toColumnSelector(
  columnsSelector: ColumnSetSelector | undefined,
  exactColumns: string[]
): ColumnSelector {
  if (columnsSelector === ALL_BLENDABLE_COLUMNS) {
    return { mode: 'allBlendable' };
  }
  if (columnsSelector === ALL_NATIVE_COLUMNS || exactColumns.length === 0) {
    return { mode: 'allNative', explicit: exactColumns };
  }
  return { mode: 'explicit', explicit: exactColumns };
}

function decodeBase64UrlJson(raw: string): unknown {
  let decoded: string;
  try {
    decoded = Buffer.from(raw, 'base64url').toString('utf-8');
  } catch {
    throw new Error('value is not valid base64url');
  }
  try {
    return JSON.parse(decoded);
  } catch {
    throw new Error('value is not valid JSON');
  }
}

const FilterParamSchema = z
  .string()
  .min(1)
  .max(HTTP_DATA_MAX_ENCODED_PARAM_LENGTH)
  .transform((raw, ctx) => {
    let parsed: unknown;
    try {
      parsed = decodeBase64UrlJson(raw);
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid filter: ${(err as Error).message}`,
      });
      return z.NEVER;
    }
    const result = FilterConfigSchema.safeParse(parsed);
    if (!result.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid filter: ${result.error.issues.map(i => i.message).join('; ')}`,
      });
      return z.NEVER;
    }
    return result.data;
  });

const SortParamSchema = z
  .string()
  .min(1)
  .max(HTTP_DATA_MAX_ENCODED_PARAM_LENGTH)
  .transform((raw, ctx) => {
    let parsed: unknown;
    try {
      parsed = decodeBase64UrlJson(raw);
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid sort: ${(err as Error).message}`,
      });
      return z.NEVER;
    }
    const result = SortConfigSchema.safeParse(parsed);
    if (!result.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid sort: ${result.error.issues.map(i => i.message).join('; ')}`,
      });
      return z.NEVER;
    }
    return result.data;
  });

const LimitParamSchema = z.coerce
  .number({ invalid_type_error: 'limit must be an integer' })
  .int('limit must be an integer')
  .min(1, 'limit must be ≥ 1');

const ExactColumnParamSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform(value => {
    if (value === undefined) return [];
    return Array.isArray(value) ? value : [value];
  })
  .pipe(z.array(z.string().min(1, 'column value must not be empty')));

const ColumnsSelectorParamSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value, ctx): ColumnSetSelector | undefined => {
    if (value === undefined) return undefined;
    const values = Array.isArray(value) ? value : [value];
    if (values.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Parameter "columns" cannot be repeated',
      });
      return z.NEVER;
    }

    const selector = values[0];
    if (selector !== ALL_NATIVE_COLUMNS && selector !== ALL_BLENDABLE_COLUMNS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `"columns" must be "${ALL_NATIVE_COLUMNS}" or "${ALL_BLENDABLE_COLUMNS}"`,
      });
      return z.NEVER;
    }

    return selector;
  });

export const HttpDataQuerySchema = z
  .object({
    columns: ColumnsSelectorParamSchema,
    column: ExactColumnParamSchema,
    filter: FilterParamSchema.optional(),
    sort: SortParamSchema.optional(),
    limit: LimitParamSchema.optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    for (const forbidden of REJECTED_PAGINATION_KEYS) {
      if (forbidden in value) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [forbidden],
          message: `Parameter "${forbidden}" is not supported by HTTP Data API`,
        });
      }
    }
    if (value.columns === ALL_BLENDABLE_COLUMNS && value.column.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['columns'],
        message: `"${ALL_BLENDABLE_COLUMNS}" cannot be combined with exact column values`,
      });
    }
  })
  .transform(value => ({
    columnSelector: toColumnSelector(value.columns, value.column),
    filter: value.filter,
    sort: value.sort,
    limit: value.limit,
  }));

export type HttpDataQuery = z.infer<typeof HttpDataQuerySchema>;
