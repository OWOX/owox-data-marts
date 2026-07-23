import { z } from 'zod';
import { ALIAS_PATH_REGEX } from './blended-fields-config.schema';
import { REPORT_AGGREGATE_FUNCTIONS } from './aggregate-function.schema';

// .finite() rejects Infinity/-Infinity/NaN: a numeric filter value reaches the SQL
// either as a bound param or inlined as a literal, and `String(Infinity)` would render
// `> Infinity` (invalid SQL), not a safe rejection.
const ScalarValueSchema = z.union([z.string(), z.number().finite(), z.boolean()]);

// Upper bound for relative-date N presets (last_n_days / last_n_months / next_n_days) —
// shared with the MCP mapper so its precise operand errors enforce the same limit.
export const RELATIVE_DATE_MAX_N = 3650;

// Semantics shared by every storage renderer:
// - this_week/last_week are ISO weeks (Monday start) on all storages — BigQuery
//   truncates with ISOWEEK, Snowflake computes Monday via DAYOFWEEKISO so the
//   session-level WEEK_START parameter cannot shift the boundary.
// - this_quarter/last_quarter are calendar quarters.
// - next_n_days mirrors last_n_days: both INCLUDE today (today .. today+n).
const RelativeDatePresetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('today') }),
  z.object({ kind: z.literal('yesterday') }),
  z.object({ kind: z.literal('this_week') }),
  z.object({ kind: z.literal('last_week') }),
  z.object({ kind: z.literal('this_month') }),
  z.object({ kind: z.literal('last_month') }),
  z.object({ kind: z.literal('this_quarter') }),
  z.object({ kind: z.literal('last_quarter') }),
  z.object({ kind: z.literal('this_year') }),
  z.object({
    kind: z.literal('last_n_days'),
    n: z.number().int().positive().max(RELATIVE_DATE_MAX_N),
  }),
  z.object({
    kind: z.literal('last_n_months'),
    n: z.number().int().positive().max(RELATIVE_DATE_MAX_N),
  }),
  z.object({
    kind: z.literal('next_n_days'),
    n: z.number().int().positive().max(RELATIVE_DATE_MAX_N),
  }),
]);

const ScalarOperatorEnum = z.enum([
  'eq',
  'neq',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'gt',
  'lt',
  'gte',
  'lte',
  'regex',
  'not_regex',
]);

const NoValueOperatorEnum = z.enum([
  'is_empty',
  'is_not_empty',
  'is_null',
  'is_not_null',
  'is_true',
  'is_false',
]);

// Bounded so a single rule can't explode the SQL text (literal dialects inline every
// value) or exhaust a dialect's bind-parameter budget (BigQuery/Athena bind one per value).
export const IN_LIST_MAX_VALUES = 500;

const FilterRuleBaseSchema = z.discriminatedUnion('operator', [
  z.object({
    column: z.string().min(1),
    operator: ScalarOperatorEnum,
    value: ScalarValueSchema,
  }),
  z.object({
    column: z.string().min(1),
    operator: NoValueOperatorEnum,
  }),
  z.object({
    column: z.string().min(1),
    operator: z.enum(['in', 'not_in']),
    // Strings or numbers, same-type only: param-binding storages type each bound
    // value individually (BigQuery raises "No matching signature for operator IN"
    // on a mixed list), so a mixed list saved via the API would fail only at query
    // time otherwise. Booleans are rejected outright — no column category permits
    // in/not_in on booleans (use is_true/is_false), and a boolean list on any other
    // column type would likewise die only in the warehouse.
    value: z
      .array(ScalarValueSchema)
      .min(1)
      .max(IN_LIST_MAX_VALUES)
      .refine((list): boolean => list.every(v => typeof v !== 'boolean'), {
        message:
          'in/not_in values must be strings or numbers — for boolean conditions use is_true/is_false',
      })
      .refine((list): boolean => list.every(v => typeof v === typeof list[0]), {
        message: 'in/not_in values must all be the same type (all strings or all numbers)',
      }),
  }),
  z.object({
    column: z.string().min(1),
    operator: z.literal('between'),
    // Same-type bounds: a string/number pair passes save-time checks but fails at
    // query time on param-binding storages — the same class the in/not_in refine closes.
    value: z
      .object({ from: ScalarValueSchema, to: ScalarValueSchema })
      .refine((v): boolean => typeof v.from === typeof v.to, {
        message: "'between' bounds must be the same type (both strings or both numbers)",
      }),
  }),
  z.object({
    column: z.string().min(1),
    operator: z.literal('relative_date'),
    value: RelativeDatePresetSchema,
  }),
]);

const PlacementExtrasSchema = z.object({
  placement: z.enum(['pre-join', 'post-join']).optional(),
  // When set, the rule filters the AGGREGATED value of `column` after grouping —
  // `HAVING <function>(column) <op> <value>` — instead of the raw rows (`WHERE`).
  // The (column, function) pair must match a configured report aggregation. A bare
  // dimension filter omits `function` and stays a WHERE rule.
  function: z.enum(REPORT_AGGREGATE_FUNCTIONS).optional(),
});

export const FilterRuleSchema = z.intersection(FilterRuleBaseSchema, PlacementExtrasSchema);

export const FilterConfigSchema = z.array(FilterRuleSchema).nullable();

export type FilterRule = z.infer<typeof FilterRuleSchema>;
export type FilterConfig = z.infer<typeof FilterConfigSchema>;
export type RelativeDatePreset = z.infer<typeof RelativeDatePresetSchema>;
export const FILTER_SCALAR_OPERATORS = ScalarOperatorEnum.options;
export const FILTER_NO_VALUE_OPERATORS = NoValueOperatorEnum.options;

export function aliasPathToCteName(aliasPath: string): string {
  if (!ALIAS_PATH_REGEX.test(aliasPath)) {
    throw new Error(`Invalid aliasPath: ${aliasPath}`);
  }
  return aliasPath.replace(/\./g, '_');
}
