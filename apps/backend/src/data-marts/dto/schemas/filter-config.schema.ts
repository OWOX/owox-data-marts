import { z } from 'zod';

const ScalarValueSchema = z.union([z.string(), z.number(), z.boolean()]);

const RelativeDatePresetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('today') }),
  z.object({ kind: z.literal('yesterday') }),
  z.object({ kind: z.literal('this_month') }),
  z.object({ kind: z.literal('last_month') }),
  z.object({ kind: z.literal('this_year') }),
  z.object({ kind: z.literal('last_n_days'), n: z.number().int().positive().max(3650) }),
  z.object({ kind: z.literal('last_n_months'), n: z.number().int().positive().max(3650) }),
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

export const FilterRuleSchema = z.discriminatedUnion('operator', [
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
    operator: z.literal('between'),
    value: z.object({ from: ScalarValueSchema, to: ScalarValueSchema }),
  }),
  z.object({
    column: z.string().min(1),
    operator: z.literal('relative_date'),
    value: RelativeDatePresetSchema,
  }),
]);

export const FilterConfigSchema = z.array(FilterRuleSchema).nullable();

export type FilterRule = z.infer<typeof FilterRuleSchema>;
export type FilterConfig = z.infer<typeof FilterConfigSchema>;
export type RelativeDatePreset = z.infer<typeof RelativeDatePresetSchema>;
export const FILTER_SCALAR_OPERATORS = ScalarOperatorEnum.options;
export const FILTER_NO_VALUE_OPERATORS = NoValueOperatorEnum.options;
