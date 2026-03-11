/**
 * Backend validation utilities for Redshift fully qualified names
 * Format: schema.table or database.schema.table
 *
 * @see {@link https://docs.aws.amazon.com/redshift/latest/dg/r_names.html} AWS Redshift Identifier Rules
 */

import {
  createFullyQualifiedNameValidator,
  createTablePatternValidator,
  StorageValidationConfig,
} from '../../utils/validation.utils';

export const REDSHIFT_VALIDATION_CONFIG: StorageValidationConfig = {
  allowedChars: 'a-zA-Z0-9_',
  allowTwoLevel: true,
};

/**
 * Validates if a string matches the AWS Redshift fully qualified name pattern
 * Format: schema.table or database.schema.table
 * Only alphanumeric characters and underscores are allowed
 * Hyphens are NOT allowed in unquoted Redshift identifiers
 * Quoted identifiers are NOT allowed to prevent SQL injection
 * @param value - The string to validate
 * @returns Boolean indicating if the string is valid
 * @see {@link https://docs.aws.amazon.com/redshift/latest/dg/r_names.html} AWS Redshift Naming Rules
 */
export const isValidRedshiftFullyQualifiedName = createFullyQualifiedNameValidator(
  REDSHIFT_VALIDATION_CONFIG
);

/**
 * Validates if a string matches the AWS Redshift table pattern format
 * Format: schema.table_* or database.schema.table_* (with wildcard)
 * Only alphanumeric characters, underscores, and wildcards are allowed
 * Hyphens are NOT allowed in unquoted Redshift identifiers
 * Quoted identifiers are NOT allowed to prevent SQL injection
 * @param value - The string to validate
 * @returns Boolean indicating if the string is valid
 * @see {@link https://docs.aws.amazon.com/redshift/latest/dg/r_names.html} AWS Redshift Naming Rules
 */
export const isValidRedshiftTablePattern = createTablePatternValidator(REDSHIFT_VALIDATION_CONFIG);
