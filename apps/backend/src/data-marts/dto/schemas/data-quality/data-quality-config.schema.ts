import { z } from 'zod';
import { DataQualityCategory } from '../../../enums/data-quality-category.enum';
import { DataQualityScope } from '../../../enums/data-quality-scope.enum';
import { DataQualitySeverity } from '../../../enums/data-quality-severity.enum';

export const DEFAULT_DATA_QUALITY_TIMEZONE = 'UTC';
export const MAX_DATA_QUALITY_THRESHOLD_HOURS = Math.floor(
  Number.MAX_SAFE_INTEGER / (60 * 60 * 1000)
);

export const DataQualityIdentifierSchema = z
  .string()
  .min(1)
  .refine(value => value.trim().length > 0, 'Identifier must not be blank');

export const DataQualityRuleKeySchema = z.string().min(1);

export function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export const DataQualityTimezoneSchema = z
  .string()
  .min(1)
  .max(255)
  .refine(isIanaTimezone, 'A valid IANA timezone is required');

export const DataQualityDataMartScopeSchema = z
  .object({ type: z.literal(DataQualityScope.DATA_MART) })
  .strict();

export const DataQualityFieldScopeSchema = z
  .object({
    type: z.literal(DataQualityScope.FIELD),
    fieldId: DataQualityIdentifierSchema,
  })
  .strict();

export const DataQualityRelationshipScopeSchema = z
  .object({
    type: z.literal(DataQualityScope.RELATIONSHIP),
    relationshipId: DataQualityIdentifierSchema,
  })
  .strict();

export const DataQualityCheckScopeSchema = z.discriminatedUnion('type', [
  DataQualityDataMartScopeSchema,
  DataQualityFieldScopeSchema,
  DataQualityRelationshipScopeSchema,
]);

export type DataQualityCheckScope = z.infer<typeof DataQualityCheckScopeSchema>;

export const DATA_QUALITY_CATEGORY_SCOPES: Readonly<
  Record<DataQualityCategory, readonly DataQualityScope[]>
> = {
  [DataQualityCategory.PK_UNIQUENESS]: [DataQualityScope.DATA_MART],
  [DataQualityCategory.DUPLICATE_ROWS]: [DataQualityScope.DATA_MART],
  [DataQualityCategory.NULL_RATE]: [DataQualityScope.FIELD],
  [DataQualityCategory.COLUMN_UNIQUENESS]: [DataQualityScope.FIELD],
  [DataQualityCategory.CONSTANT_COLUMN]: [DataQualityScope.FIELD],
  [DataQualityCategory.EMPTY_TABLE]: [DataQualityScope.DATA_MART],
  [DataQualityCategory.TYPE_MISMATCH]: [DataQualityScope.FIELD],
  [DataQualityCategory.DATA_FRESHNESS]: [DataQualityScope.DATA_MART, DataQualityScope.FIELD],
  [DataQualityCategory.FUTURE_VALUES]: [DataQualityScope.FIELD],
  [DataQualityCategory.NEGATIVE_VALUES]: [DataQualityScope.FIELD],
  [DataQualityCategory.RELATIONSHIP_INTEGRITY]: [DataQualityScope.RELATIONSHIP],
  [DataQualityCategory.REVERSE_RELATIONSHIP]: [DataQualityScope.RELATIONSHIP],
};

export function buildDataQualityRuleKey(
  category: DataQualityCategory,
  scope: DataQualityCheckScope
): string {
  switch (scope.type) {
    case DataQualityScope.DATA_MART:
      return `${category}:data_mart`;
    case DataQualityScope.FIELD:
      return `${category}:field:${scope.fieldId}`;
    case DataQualityScope.RELATIONSHIP:
      return `${category}:relationship:${scope.relationshipId}`;
  }
}

export const DataQualityCheckParametersSchema = z
  .object({
    thresholdPercent: z.number().finite().min(0).max(100).optional(),
    thresholdHours: z
      .number()
      .finite()
      .nonnegative()
      .max(MAX_DATA_QUALITY_THRESHOLD_HOURS)
      .optional(),
  })
  .strict();

const DataQualityStoredRuleObjectSchema = z
  .object({
    key: DataQualityRuleKeySchema,
    category: z.nativeEnum(DataQualityCategory),
    scope: DataQualityCheckScopeSchema,
    severity: z.nativeEnum(DataQualitySeverity),
    enabled: z.boolean(),
    parameters: DataQualityCheckParametersSchema.default({}),
  })
  .strict();

type DataQualityRuleValidationValue = z.infer<typeof DataQualityStoredRuleObjectSchema>;

function validateDataQualityRule(
  rule: DataQualityRuleValidationValue,
  context: z.RefinementCtx
): void {
  if (!DATA_QUALITY_CATEGORY_SCOPES[rule.category].includes(rule.scope.type)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['scope'],
      message: `Scope ${rule.scope.type} is not compatible with category ${rule.category}`,
    });
  }
  if (rule.key !== buildDataQualityRuleKey(rule.category, rule.scope)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['key'],
      message: 'Rule key must be the stable key derived from its category and scope',
    });
  }
  if (
    rule.parameters.thresholdPercent !== undefined &&
    rule.category !== DataQualityCategory.NULL_RATE
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['parameters', 'thresholdPercent'],
      message: 'thresholdPercent is only valid for null_rate checks',
    });
  }
  if (
    rule.category === DataQualityCategory.NULL_RATE &&
    rule.parameters.thresholdPercent === undefined
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['parameters', 'thresholdPercent'],
      message: 'thresholdPercent is required for null_rate checks',
    });
  }
  if (
    rule.parameters.thresholdHours !== undefined &&
    rule.category !== DataQualityCategory.DATA_FRESHNESS
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['parameters', 'thresholdHours'],
      message: 'thresholdHours is only valid for data_freshness checks',
    });
  }
  if (
    rule.category === DataQualityCategory.DATA_FRESHNESS &&
    rule.parameters.thresholdHours === undefined
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['parameters', 'thresholdHours'],
      message: 'thresholdHours is required for data_freshness checks',
    });
  }
}

export const DataQualityRuleConfigSchema =
  DataQualityStoredRuleObjectSchema.superRefine(validateDataQualityRule);

export type DataQualityRuleConfig = z.infer<typeof DataQualityRuleConfigSchema>;

export const EffectiveDataQualityRuleConfigSchema = DataQualityStoredRuleObjectSchema.extend({
  isApplicable: z.boolean(),
  notApplicableReason: z.string().min(1).max(1000).optional(),
})
  .strict()
  .superRefine(validateDataQualityRule);

export type EffectiveDataQualityRuleConfig = z.infer<typeof EffectiveDataQualityRuleConfigSchema>;

function validateUniqueRuleKeys(
  config: { rules: readonly { key: string }[] },
  context: z.RefinementCtx
): void {
  const keys = new Set<string>();
  config.rules.forEach((rule, index) => {
    if (keys.has(rule.key)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rules', index, 'key'],
        message: 'Rule keys must be unique',
      });
    }
    keys.add(rule.key);
  });
}

export const DataQualityConfigSchema = z
  .object({
    timezone: DataQualityTimezoneSchema,
    rules: z.array(DataQualityRuleConfigSchema),
  })
  .strict()
  .superRefine(validateUniqueRuleKeys);

export type DataQualityConfig = z.infer<typeof DataQualityConfigSchema>;

export const EffectiveDataQualityConfigSchema = z
  .object({
    timezone: DataQualityTimezoneSchema,
    rules: z.array(EffectiveDataQualityRuleConfigSchema),
  })
  .strict()
  .superRefine(validateUniqueRuleKeys);

export type EffectiveDataQualityConfig = z.infer<typeof EffectiveDataQualityConfigSchema>;

export function createAllDisabledDataQualityConfig(): DataQualityConfig {
  return {
    timezone: DEFAULT_DATA_QUALITY_TIMEZONE,
    rules: [],
  };
}
