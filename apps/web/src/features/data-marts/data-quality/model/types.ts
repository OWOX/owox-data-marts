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
  | 'future_values'
  | 'negative_values'
  | 'relationship_integrity'
  | 'reverse_relationship';

export type DataQualityCheckStatus = 'PASSED' | 'FAILED' | 'NOT_APPLICABLE' | 'ERROR';
export type DataQualityScopeType = 'DATA_MART' | 'FIELD' | 'RELATIONSHIP';

export type DataQualityCheckScope =
  | { type: 'DATA_MART' }
  | { type: 'FIELD'; fieldId: string }
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
  timezone: string;
  rules: DataQualityRuleConfig[];
}

export interface EffectiveDataQualityConfig {
  timezone: string;
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

export interface DataQualityConfigResponse {
  savedConfig: DataQualityConfig | null;
  effectiveConfig: EffectiveDataQualityConfig;
  source: 'DEFAULT' | 'SAVED';
  permissions: DataQualityPermissions;
  runEligibility: DataQualityRunEligibility;
  availableChecks: DataQualityCategory[];
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
  executedSql: string[];
  reproductionSql: string | null;
  error: DataQualityMappedError | null;
  redacted: boolean;
  createdAt?: string;
}

export interface DataQualityRunSnapshot {
  config: EffectiveDataQualityConfig;
  schema: unknown;
  relationships: unknown[];
  timezone: string;
  definitionType: DataMartDefinitionType;
}

export interface DataQualityRunDetails {
  snapshot: DataQualityRunSnapshot;
  summary: DataQualitySummary;
  results: DataQualityCheckResult[];
}

export interface DataQualityRun {
  /** Public DataMartRun id used by API routes and history. */
  id: string;
  /** Compatibility alias for the same public DataMartRun id. */
  dataMartRunId: string;
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
  description: string;
  tone: 'neutral' | 'progress' | 'success' | 'warning' | 'error';
}
