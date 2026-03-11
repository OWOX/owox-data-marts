/**
 * Backend validation utilities for Athena fully qualified names
 * Format: database.table or catalog.database.table
 *
 * @see {@link https://docs.aws.amazon.com/athena/latest/ug/tables-databases-columns-names.html} Athena Naming Rules
 */

import { createIdentifierValidator } from '../../utils/validation.utils';

const ALLOWED_CHARS = 'a-zA-Z0-9_\\-';

/**
 * Validates if a string matches the AWS Athena fully qualified name pattern
 * Format: database.table or catalog.database.table
 * Only alphanumeric characters, underscores, and hyphens are allowed
 * Quoted identifiers are NOT allowed to prevent SQL injection
 * @see {@link https://docs.aws.amazon.com/athena/latest/ug/tables-databases-columns-names.html} Athena Naming Rules
 */
export const isValidAthenaFullyQualifiedName = createIdentifierValidator({
  allowedChars: ALLOWED_CHARS,
  allowTwoLevel: true,
  allowWildcard: false,
});

/**
 * Validates if a string matches the AWS Athena table pattern format
 * Format: database.table_* or catalog.database.table_* (with wildcard)
 * Only alphanumeric characters, underscores, hyphens, and wildcards are allowed
 * Quoted identifiers are NOT allowed to prevent SQL injection
 * @see {@link https://docs.aws.amazon.com/athena/latest/ug/tables-databases-columns-names.html} Athena Naming Rules
 */
export const isValidAthenaTablePattern = createIdentifierValidator({
  allowedChars: ALLOWED_CHARS,
  allowTwoLevel: true,
  allowWildcard: true,
});
