/**
 * Backend validation utilities for BigQuery fully qualified names
 * Format: project.dataset.table
 *
 * @see {@link https://cloud.google.com/bigquery/docs/reference/standard-sql/lexical} BigQuery Lexical Structure
 */

<<<<<<< Updated upstream
import {
  createFullyQualifiedNameValidator,
  createTablePatternValidator,
  StorageValidationConfig,
} from '../../utils/validation.utils';

export const BIGQUERY_VALIDATION_CONFIG: StorageValidationConfig = {
  allowedChars: 'a-zA-Z0-9_\\-',
  allowTwoLevel: false,
};
=======
import { createIdentifierValidator } from '../../utils/validation.utils';

const ALLOWED_CHARS = 'a-zA-Z0-9_\\-';
>>>>>>> Stashed changes

/**
 * Validates if a string matches the BigQuery fully qualified name pattern
 * Format: project.dataset.table
 * Only alphanumeric characters, underscores, and hyphens are allowed
 * Quoted identifiers are NOT allowed to prevent SQL injection
 * @see {@link https://cloud.google.com/bigquery/docs/reference/standard-sql/lexical} BigQuery Identifier Syntax
 */
<<<<<<< Updated upstream
export const isValidBigQueryFullyQualifiedName = createFullyQualifiedNameValidator(
  BIGQUERY_VALIDATION_CONFIG
);
=======
export const isValidBigQueryFullyQualifiedName = createIdentifierValidator({
  allowedChars: ALLOWED_CHARS,
  allowTwoLevel: false,
  allowWildcard: false,
});
>>>>>>> Stashed changes

/**
 * Validates if a string matches the BigQuery table pattern format
 * Format: project.dataset.table_* (with wildcard)
 * Only alphanumeric characters, underscores, hyphens, and wildcards are allowed
 * Quoted identifiers are NOT allowed to prevent SQL injection
 * @see {@link https://cloud.google.com/bigquery/docs/reference/standard-sql/lexical} BigQuery Identifier Syntax
 */
<<<<<<< Updated upstream
export const isValidBigQueryTablePattern = createTablePatternValidator(BIGQUERY_VALIDATION_CONFIG);
=======
export const isValidBigQueryTablePattern = createIdentifierValidator({
  allowedChars: ALLOWED_CHARS,
  allowTwoLevel: false,
  allowWildcard: true,
});
>>>>>>> Stashed changes
