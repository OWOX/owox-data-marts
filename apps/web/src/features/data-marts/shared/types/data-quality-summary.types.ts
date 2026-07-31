export type DataQualitySeverity = 'error' | 'warning' | 'notice';

export type DataQualitySummaryState =
  | 'NEVER_RUN'
  | 'QUEUED'
  | 'RUNNING'
  | 'PASSED'
  | 'ISSUES'
  | 'EXECUTION_FAILED'
  | 'CANCELLED'
  | 'ALL_DISABLED';

export interface DataQualitySummary {
  state: DataQualitySummaryState;
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
  highestSeverity: DataQualitySeverity | null;
}

export interface DataQualityCompactSummary extends DataQualitySummary {
  dataMartRunId: string | null;
  lastRunAt: string | null;
}
