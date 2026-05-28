import { z } from 'zod';
import { FilterConfigSchema } from './filter-config.schema';
import { SortConfigSchema } from './sort-config.schema';

export const HTTP_DATA_MAX_COLUMNS = 100;
export const HTTP_DATA_MAX_USER_LIMIT = 10_000_000;
export const HTTP_DATA_MAX_ENCODED_PARAM_LENGTH = 8192;

const REJECTED_PAGINATION_KEYS = ['pageToken', 'offset'] as const;

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
  .min(1, 'limit must be ≥ 1')
  .max(HTTP_DATA_MAX_USER_LIMIT, `limit must be ≤ ${HTTP_DATA_MAX_USER_LIMIT}`);

const ColumnsParamSchema = z
  .union([z.string(), z.array(z.string())])
  .transform(value => (Array.isArray(value) ? value : [value]))
  .pipe(
    z
      .array(z.string().min(1, 'column value must not be empty'))
      .min(1, 'at least one column is required')
      .max(HTTP_DATA_MAX_COLUMNS, `at most ${HTTP_DATA_MAX_COLUMNS} columns are allowed`)
      .refine(arr => new Set(arr).size === arr.length, {
        message: 'duplicate column names are not allowed',
      })
  );

export const HttpDataQuerySchema = z
  .object({
    column: ColumnsParamSchema,
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
  })
  .transform(value => ({
    columns: value.column,
    filter: value.filter,
    sort: value.sort,
    limit: value.limit,
  }));

export type HttpDataQuery = z.infer<typeof HttpDataQuerySchema>;
