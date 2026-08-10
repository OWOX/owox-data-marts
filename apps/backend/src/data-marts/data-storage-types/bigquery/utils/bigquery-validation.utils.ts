/**
 * Backend validation utilities for BigQuery fully qualified names
 * @see {@link https://cloud.google.com/bigquery/docs/reference/standard-sql/lexical} BigQuery Lexical Structure
 */

import { createIdentifierValidator } from '../../utils/validation.utils';

const ALLOWED_CHARS = 'a-zA-Z0-9_\\-';

const threeLevelValidator = createIdentifierValidator({
  allowedChars: ALLOWED_CHARS,
  allowTwoLevel: false,
  allowWildcard: false,
});

const twoOrThreeLevelValidator = createIdentifierValidator({
  allowedChars: ALLOWED_CHARS,
  allowTwoLevel: true,
  allowWildcard: false,
});

/** Format: project.dataset.table or dataset.table (with allowTwoLevel) */
export function isValidBigQueryFullyQualifiedName(
  value: string,
  options?: { allowTwoLevel?: boolean }
): boolean {
  const validator = options?.allowTwoLevel ? twoOrThreeLevelValidator : threeLevelValidator;
  return validator(value);
}

/** Format: project.dataset.table_* (with wildcard) */
export const isValidBigQueryTablePattern = createIdentifierValidator({
  allowedChars: ALLOWED_CHARS,
  allowTwoLevel: false,
  allowWildcard: true,
});

/**
 * Single-segment identifier guards, for the rare places that interpolate a project or dataset
 * id straight into SQL because BigQuery offers no parameter form for identifiers (for example
 * a `__TABLES__` meta-table reference). They live here, beside the fully-qualified validators,
 * so there is one definition of what this codebase considers a safe BigQuery identifier.
 *
 * Project ids additionally allow `.` and `:` for the legacy `domain.com:project` form; dataset
 * ids are letters, digits and underscores only, per BigQuery's own naming rules.
 */
const BIGQUERY_PROJECT_ID_RE = /^[a-zA-Z0-9\-_.:]+$/;
const BIGQUERY_DATASET_ID_RE = /^[a-zA-Z0-9_]+$/;

export function isValidBigQueryProjectId(value: string): boolean {
  return BIGQUERY_PROJECT_ID_RE.test(value);
}

export function isValidBigQueryDatasetId(value: string): boolean {
  return BIGQUERY_DATASET_ID_RE.test(value);
}
