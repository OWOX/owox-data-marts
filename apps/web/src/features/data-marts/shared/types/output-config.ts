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
    operator: z.literal('between'),
    value: z.object({ from: ScalarValueSchema, to: ScalarValueSchema }),
  }),
  z.object({
    column: z.string().min(1),
    operator: z.literal('relative_date'),
    value: RelativeDatePresetSchema,
  }),
]);

const ALIAS_PATH_REGEX = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/;
const AliasPathSchema = z.string().min(1).max(255).regex(ALIAS_PATH_REGEX);

// Placement is optional — when absent, the rule is treated as 'post-join'.
// Keeps backward compatibility with existing filterConfig rows that pre-date
// this field and lets call sites construct plain rules without specifying
// placement when post-join is the intended default.
const PlacementExtrasSchema = z.object({
  placement: z.enum(['pre-join', 'post-join']).optional(),
  aliasPath: AliasPathSchema.optional(),
});

export const FilterRuleSchema = z
  .intersection(FilterRuleBaseSchema, PlacementExtrasSchema)
  .superRefine((rule, ctx) => {
    if (rule.placement === 'pre-join') {
      if (!rule.aliasPath) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['aliasPath'],
          message: 'aliasPath is required when placement is "pre-join"',
        });
      } else if (rule.aliasPath === 'main') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['aliasPath'],
          message: 'pre-join filter on the home data mart ("main") is not allowed',
        });
      }
    } else if (rule.aliasPath != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['aliasPath'],
        message: 'aliasPath is only valid when placement is "pre-join"',
      });
    }
  });

export const SortRuleSchema = z.object({
  column: z.string().min(1),
  direction: z.enum(['asc', 'desc']),
});

export type FilterRule = z.infer<typeof FilterRuleSchema>;
export type SortRule = z.infer<typeof SortRuleSchema>;
export type RelativeDatePreset = z.infer<typeof RelativeDatePresetSchema>;

export interface JoinedSourceColumn {
  name: string;
  type: string;
}

export interface JoinedSource {
  aliasPath: string;
  title: string;
  columns: readonly JoinedSourceColumn[];
}

export interface OutputConfig {
  filterConfig: FilterRule[];
  sortConfig: SortRule[];
  limitConfig: number | null;
}

export const EMPTY_OUTPUT_CONFIG: OutputConfig = {
  filterConfig: [],
  sortConfig: [],
  limitConfig: null,
};

export function hasAnyOutputControls(config: OutputConfig): boolean {
  return (
    config.filterConfig.length > 0 || config.sortConfig.length > 0 || config.limitConfig != null
  );
}

export function isPreJoinFilter(rule: FilterRule): rule is FilterRule & { aliasPath: string } {
  return rule.placement === 'pre-join' && !!rule.aliasPath;
}
