import type {
  DataQualityCategory,
  DataQualityConfig,
  DataQualityStatusPresentation,
  DataQualitySummaryState,
  EffectiveDataQualityConfig,
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
  future_values: 'Future values',
  negative_values: 'Negative values',
  relationship_integrity: 'Relationship integrity',
  reverse_relationship: 'Reverse relationship',
};

const STATUS_PRESENTATIONS: Record<DataQualitySummaryState, DataQualityStatusPresentation> = {
  NEVER_RUN: {
    title: 'Quality has not been run yet',
    description: 'Run the enabled checks to create the first quality report.',
    tone: 'neutral',
  },
  QUEUED: {
    title: 'Quality run queued',
    description: 'The run will start as soon as a worker is available.',
    tone: 'progress',
  },
  RUNNING: {
    title: 'Quality checks are running',
    description: 'Results are saved after each check.',
    tone: 'progress',
  },
  PASSED: {
    title: 'All enabled checks passed',
    description: 'No data quality findings were detected.',
    tone: 'success',
  },
  ISSUES: {
    title: 'Quality issues found',
    description: 'Review the failed checks and reproduce findings with SQL.',
    tone: 'warning',
  },
  EXECUTION_FAILED: {
    title: 'Quality run failed',
    description: 'Some checks could not execute. Completed results are still available below.',
    tone: 'error',
  },
  CANCELLED: {
    title: 'Quality run cancelled',
    description: 'Results completed before cancellation are preserved.',
    tone: 'neutral',
  },
  ALL_DISABLED: {
    title: 'All checks are disabled',
    description: 'Enable at least one applicable check before running Data Quality.',
    tone: 'neutral',
  },
};

export function toStoredDataQualityConfig(config: EffectiveDataQualityConfig): DataQualityConfig {
  return {
    timezone: config.timezone,
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
        scope: { ...scope },
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
      tone: 'neutral',
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
  if (scope.type === 'FIELD') return scope.fieldId;
  if (scope.type === 'RELATIONSHIP') return scope.relationshipId;
  return 'Data Mart';
}

export function areDataQualityConfigsEqual(
  left: DataQualityConfig | null,
  right: DataQualityConfig | null
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
