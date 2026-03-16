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
