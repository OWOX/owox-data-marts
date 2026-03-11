/**
 * Backend validation utilities for Redshift fully qualified names
 * Format: schema.table or database.schema.table
 *
 * @see {@link https://docs.aws.amazon.com/redshift/latest/dg/r_names.html} AWS Redshift Identifier Rules
 */

<<<<<<< Updated upstream
import {
  createFullyQualifiedNameValidator,
  createTablePatternValidator,
  StorageValidationConfig,
} from '../../utils/validation.utils';

export const REDSHIFT_VALIDATION_CONFIG: StorageValidationConfig = {
  allowedChars: 'a-zA-Z0-9_',
  allowTwoLevel: true,
};
=======
import { createIdentifierValidator } from '../../utils/validation.utils';

const ALLOWED_CHARS = 'a-zA-Z0-9_';
>>>>>>> Stashed changes

/**
 * Validates if a string matches the AWS Redshift fully qualified name pattern
 * Format: schema.table or database.schema.table
 * Only alphanumeric characters and underscores are allowed
 * Hyphens are NOT allowed in unquoted Redshift identifiers
 * Quoted identifiers are NOT allowed to prevent SQL injection
 * @see {@link https://docs.aws.amazon.com/redshift/latest/dg/r_names.html} AWS Redshift Naming Rules
 */
<<<<<<< Updated upstream
export const isValidRedshiftFullyQualifiedName = createFullyQualifiedNameValidator(
  REDSHIFT_VALIDATION_CONFIG
);
=======
export const isValidRedshiftFullyQualifiedName = createIdentifierValidator({
  allowedChars: ALLOWED_CHARS,
  allowTwoLevel: true,
  allowWildcard: false,
});
>>>>>>> Stashed changes

/**
 * Validates if a string matches the AWS Redshift table pattern format
 * Format: schema.table_* or database.schema.table_* (with wildcard)
 * Only alphanumeric characters, underscores, and wildcards are allowed
 * Hyphens are NOT allowed in unquoted Redshift identifiers
 * Quoted identifiers are NOT allowed to prevent SQL injection
 * @see {@link https://docs.aws.amazon.com/redshift/latest/dg/r_names.html} AWS Redshift Naming Rules
 */
<<<<<<< Updated upstream
export const isValidRedshiftTablePattern = createTablePatternValidator(REDSHIFT_VALIDATION_CONFIG);
=======
export const isValidRedshiftTablePattern = createIdentifierValidator({
  allowedChars: ALLOWED_CHARS,
  allowTwoLevel: true,
  allowWildcard: true,
});
>>>>>>> Stashed changes
