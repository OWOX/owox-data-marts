import { isRecord, isRfc3339DateTimeString, isUserProjection } from './validation.js';
import { DATA_MART_DEFINITION_TYPE_VALUES, type OWOXDataMartDefinitionType } from './data-marts.js';

const DATA_MART_RUN_STATUS_VALUES = [
  'PENDING',
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'CANCELLED',
  'INTERRUPTED',
  'RESTRICTED',
] as const;
export type OWOXDataMartRunStatus = (typeof DATA_MART_RUN_STATUS_VALUES)[number];

const DATA_MART_RUN_TYPE_VALUES = [
  'CONNECTOR',
  'GOOGLE_SHEETS_EXPORT',
  'LOOKER_STUDIO',
  'EXCEL',
  'EMAIL',
  'SLACK',
  'MS_TEAMS',
  'GOOGLE_CHAT',
  'INSIGHT',
  'INSIGHT_TEMPLATE',
  'AI_ASSISTANT',
  'HTTP_DATA',
  'MCP_QUERY',
  'DATA_QUALITY',
] as const;
export type OWOXDataMartRunType = (typeof DATA_MART_RUN_TYPE_VALUES)[number];

const DATA_MART_RUN_TRIGGER_VALUES = ['manual', 'scheduled'] as const;
export type OWOXDataMartRunTriggerType = (typeof DATA_MART_RUN_TRIGGER_VALUES)[number];

const DATA_QUALITY_SUMMARY_STATE_VALUES = [
  'NEVER_RUN',
  'QUEUED',
  'RUNNING',
  'PASSED',
  'ISSUES',
  'EXECUTION_FAILED',
  'RESTRICTED',
  'CANCELLED',
  'ALL_DISABLED',
] as const;
export type OWOXDataQualitySummaryState = (typeof DATA_QUALITY_SUMMARY_STATE_VALUES)[number];

const DATA_QUALITY_SEVERITY_VALUES = ['notice', 'warning', 'error'] as const;
export type OWOXDataQualitySeverity = (typeof DATA_QUALITY_SEVERITY_VALUES)[number];

const DATA_QUALITY_CATEGORY_VALUES = [
  'pk_uniqueness',
  'duplicate_rows',
  'null_rate',
  'column_uniqueness',
  'constant_column',
  'empty_table',
  'type_mismatch',
  'data_freshness',
  'negative_values',
  'relationship_integrity',
  'reverse_relationship',
] as const;
export type OWOXDataQualityCategory = (typeof DATA_QUALITY_CATEGORY_VALUES)[number];

const DATA_QUALITY_CHECK_STATUS_VALUES = ['PASSED', 'FAILED', 'NOT_APPLICABLE', 'ERROR'] as const;
export type OWOXDataQualityCheckStatus = (typeof DATA_QUALITY_CHECK_STATUS_VALUES)[number];

export type OWOXDataMartRunUser = {
  userId: string;
  fullName?: string | null;
  email?: string | null;
  avatar?: string | null;
};

export type OWOXDataQualitySummary = {
  state: OWOXDataQualitySummaryState;
  enabledChecks: number;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  notApplicableChecks: number;
  errorChecks: number;
  noticeFindings: number;
  warningFindings: number;
  errorFindings: number;
  violationCount: number;
  highestSeverity: OWOXDataQualitySeverity | null;
};

export type OWOXCompactDataQualitySummary = OWOXDataQualitySummary & {
  dataMartRunId: string | null;
  lastRunAt: string | null;
};

export type OWOXDataQualityScope =
  | { type: 'DATA_MART' }
  | { type: 'FIELD'; fieldPath: string[] }
  | { type: 'RELATIONSHIP'; relationshipId: string };

export type OWOXDataQualityRule = {
  key: string;
  category: OWOXDataQualityCategory;
  scope: OWOXDataQualityScope;
  severity: OWOXDataQualitySeverity;
  enabled: boolean;
  parameters: { thresholdPercent?: number; thresholdHours?: number };
  isApplicable: boolean;
  notApplicableReason?: string;
};

export type OWOXDataQualityRunDetail = {
  snapshot: {
    config: { rules: OWOXDataQualityRule[] };
    schema: Record<string, unknown> | null;
    relationships: Array<{
      id: string;
      sourceDataMartId: string;
      targetDataMartId: string;
      targetAlias: string;
      joinConditions: Array<{ sourceFieldName: string; targetFieldName: string }>;
      targetAccessible?: boolean;
    }>;
    definitionType: OWOXDataMartDefinitionType;
  };
  summary: OWOXDataQualitySummary;
  results: Array<{
    id: string;
    ruleKey: string;
    category: OWOXDataQualityCategory;
    scope: OWOXDataQualityScope;
    severity: OWOXDataQualitySeverity;
    status: OWOXDataQualityCheckStatus;
    violationCount: number;
    description: string;
    examples: Array<{ values: Record<string, unknown> }>;
    sql: string | null;
    error: { code: string | null; message: string; details: Record<string, unknown> | null } | null;
    createdAt: string;
    redacted: boolean;
  }>;
};

export type OWOXDataMartRun = {
  id: string;
  status: OWOXDataMartRunStatus;
  type: OWOXDataMartRunType;
  runType: OWOXDataMartRunTriggerType;
  dataMartId: string;
  definitionRun: Record<string, unknown> | null;
  reportId: string | null;
  reportDefinition: Record<string, unknown> | null;
  insightId: string | null;
  insightDefinition: Record<string, unknown> | null;
  insightTemplateId: string | null;
  insightTemplateDefinition: Record<string, unknown> | null;
  aiSourceDefinition: Record<string, unknown> | null;
  logs: string[] | null;
  errors: string[] | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdByUser: OWOXDataMartRunUser | null;
  additionalParams: Record<string, unknown> | null;
  totals: Record<string, number | string | boolean | null> | null;
  qualitySummary: OWOXCompactDataQualitySummary | null;
};

export type OWOXDataMartRunDetail = OWOXDataMartRun & {
  dataQuality: OWOXDataQualityRunDetail | null;
};

export type OWOXDataMartRunsResponse = { runs: OWOXDataMartRun[] };
export type OWOXDataMartRunListOptions = { limit?: number; offset?: number };
export type OWOXDataMartRunStartOptions =
  | { runType?: 'INCREMENTAL'; data?: never }
  | { runType: 'MANUAL_BACKFILL'; data?: Record<string, unknown> };
export type OWOXRunDataMartResponse = { runId: string };

const RUN_STATUSES = new Set<string>(DATA_MART_RUN_STATUS_VALUES);
const RUN_TYPES = new Set<string>(DATA_MART_RUN_TYPE_VALUES);
const RUN_TRIGGERS = new Set<string>(DATA_MART_RUN_TRIGGER_VALUES);
const SUMMARY_STATES = new Set<string>(DATA_QUALITY_SUMMARY_STATE_VALUES);
const SEVERITIES = new Set<string>(DATA_QUALITY_SEVERITY_VALUES);
const CATEGORIES = new Set<string>(DATA_QUALITY_CATEGORY_VALUES);
const CHECK_STATUSES = new Set<string>(DATA_QUALITY_CHECK_STATUS_VALUES);
const DEFINITION_TYPES = new Set<string>(DATA_MART_DEFINITION_TYPE_VALUES);

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

function isNullableBoundedString(value: unknown, maxLength: number): boolean {
  return (
    value === null || (typeof value === 'string' && value.length >= 1 && value.length <= maxLength)
  );
}

function isNullableRecord(value: unknown): boolean {
  return value === null || isRecord(value);
}

function isNullableStringArray(value: unknown): boolean {
  return value === null || (Array.isArray(value) && value.every(item => typeof item === 'string'));
}

function isNullableDateTime(value: unknown): boolean {
  return value === null || isRfc3339DateTimeString(value);
}

function isEnum(value: unknown, values: ReadonlySet<string>): boolean {
  return typeof value === 'string' && values.has(value);
}

function isNonNegativeInteger(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isDataQualityIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim().length > 0;
}

function isNullableTotals(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) &&
      Object.values(value).every(
        item =>
          item === null ||
          typeof item === 'number' ||
          typeof item === 'string' ||
          typeof item === 'boolean'
      ))
  );
}

function isDataQualitySummary(value: unknown): value is OWOXDataQualitySummary {
  return (
    isRecord(value) &&
    typeof value.state === 'string' &&
    SUMMARY_STATES.has(value.state) &&
    isNonNegativeInteger(value.enabledChecks) &&
    isNonNegativeInteger(value.totalChecks) &&
    isNonNegativeInteger(value.passedChecks) &&
    isNonNegativeInteger(value.failedChecks) &&
    isNonNegativeInteger(value.notApplicableChecks) &&
    isNonNegativeInteger(value.errorChecks) &&
    isNonNegativeInteger(value.noticeFindings) &&
    isNonNegativeInteger(value.warningFindings) &&
    isNonNegativeInteger(value.errorFindings) &&
    isNonNegativeInteger(value.violationCount) &&
    (value.highestSeverity === null ||
      (typeof value.highestSeverity === 'string' && SEVERITIES.has(value.highestSeverity)))
  );
}

function isCompactDataQualitySummary(value: unknown): value is OWOXCompactDataQualitySummary {
  const summary = value as Record<string, unknown>;
  return (
    isDataQualitySummary(value) &&
    isNullableString(summary.dataMartRunId) &&
    isNullableDateTime(summary.lastRunAt)
  );
}

function isDataQualityScope(value: unknown): value is OWOXDataQualityScope {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  if (value.type === 'DATA_MART') return true;
  if (value.type === 'FIELD') {
    return (
      Array.isArray(value.fieldPath) &&
      value.fieldPath.length > 0 &&
      value.fieldPath.every(isDataQualityIdentifier)
    );
  }
  return value.type === 'RELATIONSHIP' && isDataQualityIdentifier(value.relationshipId);
}

function isDataQualityRule(value: unknown): value is OWOXDataQualityRule {
  if (!isRecord(value) || !isRecord(value.parameters)) return false;
  if (
    typeof value.category !== 'string' ||
    !CATEGORIES.has(value.category) ||
    !isDataQualityScope(value.scope)
  ) {
    return false;
  }
  const thresholdPercent = value.parameters.thresholdPercent;
  const thresholdHours = value.parameters.thresholdHours;
  return (
    isDataQualityIdentifier(value.key) &&
    typeof value.severity === 'string' &&
    SEVERITIES.has(value.severity) &&
    typeof value.enabled === 'boolean' &&
    (thresholdPercent === undefined ||
      (typeof thresholdPercent === 'number' && Number.isFinite(thresholdPercent))) &&
    (thresholdHours === undefined ||
      (typeof thresholdHours === 'number' && Number.isFinite(thresholdHours))) &&
    typeof value.isApplicable === 'boolean' &&
    (value.notApplicableReason === undefined ||
      (typeof value.notApplicableReason === 'string' &&
        value.notApplicableReason.length >= 1 &&
        value.notApplicableReason.length <= 1000))
  );
}

function isDataQualityRunDetail(value: unknown): value is OWOXDataQualityRunDetail {
  if (!isRecord(value) || !isRecord(value.snapshot) || !isRecord(value.snapshot.config)) {
    return false;
  }
  const relationships = value.snapshot.relationships;
  const results = value.results;
  const rules = value.snapshot.config.rules;
  return (
    Array.isArray(rules) &&
    rules.every(isDataQualityRule) &&
    isNullableRecord(value.snapshot.schema) &&
    Array.isArray(relationships) &&
    relationships.every(
      relationship =>
        isRecord(relationship) &&
        isDataQualityIdentifier(relationship.id) &&
        isDataQualityIdentifier(relationship.sourceDataMartId) &&
        isDataQualityIdentifier(relationship.targetDataMartId) &&
        isDataQualityIdentifier(relationship.targetAlias) &&
        Array.isArray(relationship.joinConditions) &&
        relationship.joinConditions.every(
          condition =>
            isRecord(condition) &&
            typeof condition.sourceFieldName === 'string' &&
            condition.sourceFieldName.length > 0 &&
            typeof condition.targetFieldName === 'string' &&
            condition.targetFieldName.length > 0
        ) &&
        (relationship.targetAccessible === undefined ||
          typeof relationship.targetAccessible === 'boolean')
    ) &&
    typeof value.snapshot.definitionType === 'string' &&
    DEFINITION_TYPES.has(value.snapshot.definitionType) &&
    isDataQualitySummary(value.summary) &&
    Array.isArray(results) &&
    results.every(
      result =>
        isRecord(result) &&
        isDataQualityIdentifier(result.id) &&
        typeof result.ruleKey === 'string' &&
        result.ruleKey.length > 0 &&
        typeof result.category === 'string' &&
        CATEGORIES.has(result.category) &&
        isDataQualityScope(result.scope) &&
        typeof result.severity === 'string' &&
        SEVERITIES.has(result.severity) &&
        typeof result.status === 'string' &&
        CHECK_STATUSES.has(result.status) &&
        isNonNegativeInteger(result.violationCount) &&
        typeof result.description === 'string' &&
        Array.isArray(result.examples) &&
        result.examples.length <= 3 &&
        result.examples.every(example => isRecord(example) && isRecord(example.values)) &&
        isNullableString(result.sql) &&
        (result.error === null ||
          (isRecord(result.error) &&
            isNullableBoundedString(result.error.code, 255) &&
            typeof result.error.message === 'string' &&
            result.error.message.length > 0 &&
            isNullableRecord(result.error.details))) &&
        isRfc3339DateTimeString(result.createdAt) &&
        typeof result.redacted === 'boolean'
    )
  );
}

export function isDataMartRun(value: unknown): value is OWOXDataMartRun {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    isEnum(value.status, RUN_STATUSES) &&
    isEnum(value.type, RUN_TYPES) &&
    isEnum(value.runType, RUN_TRIGGERS) &&
    typeof value.dataMartId === 'string' &&
    isNullableRecord(value.definitionRun) &&
    isNullableString(value.reportId) &&
    isNullableRecord(value.reportDefinition) &&
    isNullableString(value.insightId) &&
    isNullableRecord(value.insightDefinition) &&
    isNullableString(value.insightTemplateId) &&
    isNullableRecord(value.insightTemplateDefinition) &&
    isNullableRecord(value.aiSourceDefinition) &&
    isNullableStringArray(value.logs) &&
    isNullableStringArray(value.errors) &&
    isRfc3339DateTimeString(value.createdAt) &&
    isNullableDateTime(value.startedAt) &&
    isNullableDateTime(value.finishedAt) &&
    (value.createdByUser === null || isUserProjection(value.createdByUser)) &&
    isNullableRecord(value.additionalParams) &&
    isNullableTotals(value.totals) &&
    (value.qualitySummary === null || isCompactDataQualitySummary(value.qualitySummary))
  );
}

export function isDataMartRunDetail(value: unknown): value is OWOXDataMartRunDetail {
  const detail = value as Record<string, unknown>;
  return (
    isDataMartRun(value) &&
    (detail.dataQuality === null || isDataQualityRunDetail(detail.dataQuality))
  );
}
