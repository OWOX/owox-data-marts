import type {
  DataQualityCategory,
  DataQualityConfig,
  DataQualityCheckResult,
  DataQualityStatusPresentation,
  DataQualitySummaryState,
  EffectiveDataQualityConfig,
  EffectiveDataQualityRuleConfig,
} from './types';

export const DATA_QUALITY_CATEGORY_LABELS: Record<DataQualityCategory, string> = {
  empty_table: 'Empty table',
  pk_uniqueness: 'Primary key uniqueness',
  duplicate_rows: 'Duplicate rows',
  null_rate: 'Null rate',
  column_uniqueness: 'Column uniqueness',
  constant_column: 'Constant column',
  type_mismatch: 'Type mismatch',
  data_freshness: 'Data freshness',
  negative_values: 'Negative values',
  relationship_integrity: 'Relationship integrity',
  reverse_relationship: 'Reverse relationship',
};

export const DATA_QUALITY_CATEGORY_DESCRIPTIONS: Record<DataQualityCategory, string> = {
  empty_table: 'Finds a problem when the Data Mart contains no rows.',
  pk_uniqueness: 'Checks that the Output Schema primary key identifies each row once.',
  duplicate_rows: 'Finds duplicate rows across all materialized Output Schema fields.',
  null_rate: 'Checks whether the share of null values exceeds the configured threshold.',
  column_uniqueness: 'Finds repeated non-null values in this field.',
  constant_column: 'Finds fields that contain only one distinct value.',
  type_mismatch: 'Compares the stored column type with the saved Output Schema type.',
  data_freshness: 'Checks whether the latest instant timestamp is within the configured threshold.',
  negative_values: 'Finds numeric values below zero.',
  relationship_integrity: 'Finds source join values missing from the target Data Mart.',
  reverse_relationship: 'Finds target join values unused by the source Data Mart.',
};

const STATUS_PRESENTATIONS: Record<DataQualitySummaryState, DataQualityStatusPresentation> = {
  NEVER_RUN: {
    title: 'No runs yet',
    description: 'Run the enabled checks to create the first quality report.',
  },
  QUEUED: {
    title: 'Run queued…',
    description: 'The run will start as soon as a worker is available.',
  },
  RUNNING: {
    title: 'Running checks…',
  },
  PASSED: {
    title: 'All checks passed',
    description: 'No data quality findings were detected.',
  },
  ISSUES: {
    title: 'Issues found',
    description: 'Settings and the detailed report are available below.',
  },
  EXECUTION_FAILED: {
    title: 'Execution failed',
    description: 'Some checks could not execute. Completed results are still available below.',
  },
  CANCELLED: {
    title: 'Run cancelled',
    description: 'Results completed before cancellation are preserved.',
  },
  ALL_DISABLED: {
    title: 'All checks are disabled',
    description: 'Enable at least one applicable check before running Data Quality.',
  },
};

export function toStoredDataQualityConfig(config: EffectiveDataQualityConfig): DataQualityConfig {
  return {
    rules: config.rules.map(
      ({
        key,
        category,
        scope,
        severity,
        enabled,
        parameters,
      }): DataQualityConfig['rules'][number] => ({
        key,
        category,
        scope:
          scope.type === 'FIELD'
            ? { type: scope.type, fieldPath: [...scope.fieldPath] }
            : { ...scope },
        severity,
        enabled,
        parameters: { ...parameters },
      })
    ),
  };
}

export function getDataQualityStatusPresentation(summary: {
  state: DataQualitySummaryState;
  totalChecks?: number;
  notApplicableChecks?: number;
}): DataQualityStatusPresentation {
  if ((summary.totalChecks ?? 0) > 0 && summary.notApplicableChecks === summary.totalChecks) {
    return {
      title: 'No checks are applicable',
      description: 'The configured checks do not apply to the current schema or relationships.',
    };
  }
  return STATUS_PRESENTATIONS[summary.state];
}

export function dataQualityPollingInterval(
  state: DataQualitySummaryState | undefined
): 2000 | false {
  return state === 'QUEUED' || state === 'RUNNING' ? 2_000 : false;
}

export function dataQualityScopeLabel(scope: DataQualityConfig['rules'][number]['scope']): string {
  if (scope.type === 'FIELD') return scope.fieldPath.join('.');
  if (scope.type === 'RELATIONSHIP') return scope.relationshipId;
  return 'Data Mart';
}

export interface DataQualityRelationshipPresentation {
  titleSuffix?: string;
  scopeLabel: string;
  scopeDetails: string[];
  targetAlias?: string;
}

export function getDataQualityRelationshipPresentation(
  relationshipId: string,
  relationships: readonly unknown[]
): DataQualityRelationshipPresentation {
  const relationshipIdLabel = `Relationship ID: ${relationshipId}`;
  const relationship = relationships.find(item => isRecord(item) && item.id === relationshipId);
  if (!isRecord(relationship)) {
    return { scopeLabel: relationshipIdLabel, scopeDetails: [] };
  }

  const targetAlias =
    typeof relationship.targetAlias === 'string' && relationship.targetAlias.trim()
      ? relationship.targetAlias
      : undefined;
  const joinMapping = Array.isArray(relationship.joinConditions)
    ? relationship.joinConditions
        .flatMap(condition => {
          if (!isRecord(condition)) return [];
          const sourceFieldName = condition.sourceFieldName;
          const targetFieldName = condition.targetFieldName;
          if (typeof sourceFieldName !== 'string' || typeof targetFieldName !== 'string') return [];
          return `${sourceFieldName} → ${targetFieldName}`;
        })
        .join(', ')
    : '';

  return {
    ...(targetAlias ? { titleSuffix: targetAlias, targetAlias } : {}),
    scopeLabel: joinMapping || relationshipIdLabel,
    scopeDetails: joinMapping ? [relationshipIdLabel] : [],
  };
}

export function areDataQualityConfigsEqual(
  left: DataQualityConfig | null,
  right: DataQualityConfig | null
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export interface DataQualityFieldRuleGroup {
  fieldPath: string[];
  fieldPathKey: string;
  label: string;
  rules: EffectiveDataQualityRuleConfig[];
}

export interface DataQualitySelectableCheck {
  key: string;
  label: string;
  description: string;
  isAdded: boolean;
}

export interface DataQualitySelectableField {
  fieldPath: string[];
  fieldPathKey: string;
  label: string;
  type?: string;
  checks: DataQualitySelectableCheck[];
}

export function groupDataQualityFieldRules(
  rules: readonly EffectiveDataQualityRuleConfig[]
): DataQualityFieldRuleGroup[] {
  const groups = new Map<string, EffectiveDataQualityRuleConfig[]>();
  const paths = new Map<string, string[]>();

  for (const rule of rules) {
    if (rule.scope.type !== 'FIELD') continue;
    const key = JSON.stringify(rule.scope.fieldPath);
    const group = groups.get(key) ?? [];
    group.push(rule);
    groups.set(key, group);
    paths.set(key, rule.scope.fieldPath);
  }

  return Array.from(groups, ([fieldPathKey, fieldRules]) => {
    const fieldPath = paths.get(fieldPathKey);
    if (!fieldPath) throw new Error(`Missing Data Quality field path for ${fieldPathKey}`);
    return {
      fieldPath: [...fieldPath],
      fieldPathKey,
      label: fieldPath.join('.'),
      rules: fieldRules,
    };
  }).sort(
    (left, right) =>
      left.label.localeCompare(right.label) || left.fieldPathKey.localeCompare(right.fieldPathKey)
  );
}

export function getDisplayedDataQualityFieldRuleKeys(
  baseline: DataQualityConfig | null,
  draft: DataQualityConfig | null
): string[] {
  const displayedRuleKeys = new Set<string>();

  for (const config of [baseline, draft]) {
    for (const rule of config?.rules ?? []) {
      if (rule.enabled && rule.scope.type === 'FIELD') {
        displayedRuleKeys.add(rule.key);
      }
    }
  }

  return Array.from(displayedRuleKeys).sort((left, right) => left.localeCompare(right));
}

export function getSelectableDataQualityFields(
  rules: readonly EffectiveDataQualityRuleConfig[],
  displayedRuleKeys: Iterable<string>
): DataQualitySelectableField[] {
  const displayed = new Set(displayedRuleKeys);

  return groupDataQualityFieldRules(rules)
    .map(group => ({
      fieldPath: [...group.fieldPath],
      fieldPathKey: group.fieldPathKey,
      label: group.label,
      checks: group.rules
        .filter(rule => rule.isApplicable)
        .map(rule => ({
          key: rule.key,
          label: DATA_QUALITY_CATEGORY_LABELS[rule.category],
          description: DATA_QUALITY_CATEGORY_DESCRIPTIONS[rule.category],
          isAdded: displayed.has(rule.key),
        })),
    }))
    .filter(field => field.checks.some(check => !check.isAdded));
}

const RESULT_STATUS_ORDER: Record<DataQualityCheckResult['status'], number> = {
  ERROR: 0,
  FAILED: 1,
  PASSED: 2,
  NOT_APPLICABLE: 3,
};

const RESULT_SEVERITY_ORDER: Record<DataQualityCheckResult['severity'], number> = {
  error: 0,
  warning: 1,
  notice: 2,
};

export function sortDataQualityResults(
  results: readonly DataQualityCheckResult[]
): DataQualityCheckResult[] {
  return [...results].sort((left, right) => {
    const statusDifference = RESULT_STATUS_ORDER[left.status] - RESULT_STATUS_ORDER[right.status];
    if (statusDifference !== 0) return statusDifference;

    const severityDifference =
      RESULT_SEVERITY_ORDER[left.severity] - RESULT_SEVERITY_ORDER[right.severity];
    if (severityDifference !== 0) return severityDifference;

    return left.ruleKey.localeCompare(right.ruleKey);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
