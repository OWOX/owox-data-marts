import type {
  DataQualitySeverity,
  DataQualitySummary,
} from '../../shared/types/data-quality-summary.types';
import type { DataMartDefinitionType } from '../../shared/enums/data-mart-definition-type.enum';

export type {
  DataQualityCompactSummary,
  DataQualitySeverity,
  DataQualitySummary,
  DataQualitySummaryState,
} from '../../shared/types/data-quality-summary.types';

export type DataQualityCategory =
  | 'empty_table'
  | 'pk_uniqueness'
  | 'duplicate_rows'
  | 'null_rate'
  | 'column_uniqueness'
  | 'constant_column'
  | 'type_mismatch'
  | 'data_freshness'
  | 'negative_values'
  | 'relationship_integrity'
  | 'reverse_relationship';

export type DataQualityCheckStatus = 'PASSED' | 'FAILED' | 'NOT_APPLICABLE' | 'ERROR';

export type DataQualityCheckScope =
  | { type: 'DATA_MART' }
  | { type: 'FIELD'; fieldPath: string[] }
  | { type: 'RELATIONSHIP'; relationshipId: string };

export interface DataQualityCheckParameters {
  thresholdPercent?: number;
  thresholdHours?: number;
}

export interface DataQualityRuleConfig {
  key: string;
  category: DataQualityCategory;
  scope: DataQualityCheckScope;
  severity: DataQualitySeverity;
  enabled: boolean;
  parameters: DataQualityCheckParameters;
}

export interface EffectiveDataQualityRuleConfig extends DataQualityRuleConfig {
  isApplicable: boolean;
  notApplicableReason?: string;
}

export interface DataQualityConfig {
  rules: DataQualityRuleConfig[];
}

export interface EffectiveDataQualityConfig {
  rules: EffectiveDataQualityRuleConfig[];
}

export interface DataQualityPermissions {
  canEdit: boolean;
  canRun: boolean;
}

export interface DataQualityRunEligibility {
  eligible: boolean;
  code:
    | 'NOT_PUBLISHED'
    | 'OUTPUT_SCHEMA_REQUIRED'
    | 'DEFINITION_REQUIRED'
    | 'NO_APPLICABLE_CHECKS'
    | 'ACTIVE_RUN'
    | null;
  activeRunId: string | null;
}

export interface DataQualityRelationshipJoinCondition {
  sourceFieldName: string;
  targetFieldName: string;
}

export interface DataQualityRelationshipMetadata {
  id: string;
  targetAlias: string;
  joinConditions: DataQualityRelationshipJoinCondition[];
}

export interface DataQualityConfigResponse {
  savedConfig: DataQualityConfig | null;
  effectiveConfig: EffectiveDataQualityConfig;
  configRevision: string;
  source: 'DEFAULT' | 'SAVED';
  permissions: DataQualityPermissions;
  runEligibility: DataQualityRunEligibility;
  relationships: DataQualityRelationshipMetadata[];
}

export interface RunDataQualityRequest {
  configRevision?: string;
}

export interface RunDataQualityResponse {
  runId: string;
}

export interface DataQualityResultExample {
  values: Record<string, unknown>;
}

export interface DataQualityMappedError {
  code: string | null;
  message: string;
  details: Record<string, unknown> | null;
}

export interface DataQualityCheckResult {
  id: string;
  ruleKey: string;
  category: DataQualityCategory;
  scope: DataQualityCheckScope;
  severity: DataQualitySeverity;
  status: DataQualityCheckStatus;
  violationCount: number;
  description: string;
  examples: DataQualityResultExample[];
  sql: string | null;
  error: DataQualityMappedError | null;
  redacted: boolean;
  createdAt?: string;
}

export interface DataQualityRunSnapshot {
  config: EffectiveDataQualityConfig;
  schema: unknown;
  relationships: unknown[];
  definitionType: DataMartDefinitionType;
}

export interface DataQualityRunDetails {
  snapshot: DataQualityRunSnapshot;
  summary: DataQualitySummary;
  results: DataQualityCheckResult[];
}

export interface DataQualityRun {
  runId: string;
  snapshot?: DataQualityRunSnapshot;
  summary: DataQualitySummary;
  results: DataQualityCheckResult[];
  createdAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export class DataQualityRunDetailsMissingError extends Error {
  readonly code = 'DATA_QUALITY_DETAILS_MISSING' as const;

  constructor(readonly runId: string) {
    super(`Data Quality details are unavailable for run ${runId}`);
    this.name = 'DataQualityRunDetailsMissingError';
  }
}

export interface DataQualityStatusPresentation {
  title: string;
  description?: string;
}
