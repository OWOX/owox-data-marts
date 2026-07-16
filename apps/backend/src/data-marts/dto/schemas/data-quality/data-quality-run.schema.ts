import { z } from 'zod';
import { DataMartSchemaSchema } from '../../../data-storage-types/data-mart-schema.type';
import { DataQualityCategory } from '../../../enums/data-quality-category.enum';
import { DataQualityCheckStatus } from '../../../enums/data-quality-check-status.enum';
import { DataQualitySeverity } from '../../../enums/data-quality-severity.enum';
import { DataQualitySummaryState } from '../../../enums/data-quality-summary-state.enum';
import { DataMartDefinitionType } from '../../../enums/data-mart-definition-type.enum';
import { JoinConditionsSchema } from '../join-condition.schema';
import {
  DataQualityCheckScopeSchema,
  EffectiveDataQualityConfigSchema,
  DataQualityIdentifierSchema,
  DataQualityRuleKeySchema,
  DataQualityTimezoneSchema,
} from './data-quality-config.schema';

export const DataQualityRelationshipSnapshotSchema = z
  .object({
    id: DataQualityIdentifierSchema,
    sourceDataMartId: DataQualityIdentifierSchema,
    targetDataMartId: DataQualityIdentifierSchema,
    targetAlias: DataQualityIdentifierSchema,
    joinConditions: JoinConditionsSchema,
    targetAccessible: z.boolean().optional(),
  })
  .strict();

export type DataQualityRelationshipSnapshot = z.infer<typeof DataQualityRelationshipSnapshotSchema>;

export const DataQualityResultExampleSchema = z
  .object({ values: z.record(z.string(), z.unknown()) })
  .strict();

export type DataQualityResultExample = z.infer<typeof DataQualityResultExampleSchema>;

const NonNegativeIntegerSchema = z.number().int().nonnegative().safe();

export const DataQualitySummarySchema = z
  .object({
    state: z.nativeEnum(DataQualitySummaryState),
    enabledChecks: NonNegativeIntegerSchema,
    totalChecks: NonNegativeIntegerSchema,
    passedChecks: NonNegativeIntegerSchema,
    failedChecks: NonNegativeIntegerSchema,
    notApplicableChecks: NonNegativeIntegerSchema,
    errorChecks: NonNegativeIntegerSchema,
    noticeFindings: NonNegativeIntegerSchema,
    warningFindings: NonNegativeIntegerSchema,
    errorFindings: NonNegativeIntegerSchema,
    violationCount: NonNegativeIntegerSchema,
    highestSeverity: z.nativeEnum(DataQualitySeverity).nullable(),
  })
  .strict();

export type DataQualitySummary = z.infer<typeof DataQualitySummarySchema>;

export const DataQualityRunSnapshotSchema = z
  .object({
    config: EffectiveDataQualityConfigSchema,
    schema: DataMartSchemaSchema.nullable(),
    relationships: z.array(DataQualityRelationshipSnapshotSchema),
    timezone: DataQualityTimezoneSchema,
    definitionType: z.nativeEnum(DataMartDefinitionType),
  })
  .strict();

export type DataQualityRunSnapshot = z.infer<typeof DataQualityRunSnapshotSchema>;

export const DataQualityMappedErrorSchema = z
  .object({
    code: z.string().min(1).max(255).nullable(),
    message: z.string().min(1),
    details: z.record(z.string(), z.unknown()).nullable(),
  })
  .strict();

export type DataQualityMappedError = z.infer<typeof DataQualityMappedErrorSchema>;

export const DataQualityCheckResultSchema = z
  .object({
    id: DataQualityIdentifierSchema,
    ruleKey: DataQualityRuleKeySchema,
    category: z.nativeEnum(DataQualityCategory),
    scope: DataQualityCheckScopeSchema,
    severity: z.nativeEnum(DataQualitySeverity),
    status: z.nativeEnum(DataQualityCheckStatus),
    violationCount: NonNegativeIntegerSchema,
    description: z.string(),
    examples: z.array(DataQualityResultExampleSchema).max(3),
    executedSql: z.array(z.string()),
    reproductionSql: z.string().nullable(),
    error: DataQualityMappedErrorSchema.nullable(),
  })
  .strict();

export type DataQualityCheckResultSnapshot = z.infer<typeof DataQualityCheckResultSchema>;

export const DataQualityStoredCheckResultSchema = DataQualityCheckResultSchema.extend({
  createdAt: z.string().datetime(),
});

export type DataQualityStoredCheckResult = z.infer<typeof DataQualityStoredCheckResultSchema>;

export const DataQualityStoredCheckResultsSchema = z
  .array(DataQualityStoredCheckResultSchema)
  .superRefine((results, context) => {
    const keys = new Set<string>();
    results.forEach((result, index) => {
      if (keys.has(result.ruleKey)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'ruleKey'],
          message: 'Data Quality result rule keys must be unique',
        });
      }
      keys.add(result.ruleKey);
    });
  });
