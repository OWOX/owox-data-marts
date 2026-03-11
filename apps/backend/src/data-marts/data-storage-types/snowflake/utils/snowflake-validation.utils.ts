/**
 * Backend validation utilities for Snowflake fully qualified names
 * Format: database.schema.table
 *
 * @see {@link https://docs.snowflake.com/en/sql-reference/identifiers.html} Snowflake Identifier Syntax
 */

import {
  createFullyQualifiedNameValidator,
  createTablePatternValidator,
  StorageValidationConfig,
} from '../../utils/validation.utils';

export const SNOWFLAKE_VALIDATION_CONFIG: StorageValidationConfig = {
  allowedChars: 'a-zA-Z0-9_$',
  allowTwoLevel: false,
};

/**
 * Validates if a string matches the Snowflake fully qualified name pattern
 * Format: database.schema.table
 * Only alphanumeric characters, underscores, and dollar signs are allowed
 * Quoted identifiers are NOT allowed to prevent SQL injection
 * @param value - The string to validate
 * @returns Boolean indicating if the string is valid
 * @see {@link https://docs.snowflake.com/en/sql-reference/identifiers.html} Snowflake Identifier Syntax
 */
export const isValidSnowflakeFullyQualifiedName = createFullyQualifiedNameValidator(
  SNOWFLAKE_VALIDATION_CONFIG
);

/**
 * Validates if a string matches the Snowflake table pattern format
 * Format: database.schema.table_* (with wildcard)
 * Only alphanumeric characters, underscores, dollar signs, and wildcards are allowed
 * Quoted identifiers are NOT allowed to prevent SQL injection
 * @param value - The string to validate
 * @returns Boolean indicating if the string is valid
 * @see {@link https://docs.snowflake.com/en/sql-reference/identifiers.html} Snowflake Identifier Syntax
 */
export const isValidSnowflakeTablePattern = createTablePatternValidator(
  SNOWFLAKE_VALIDATION_CONFIG
);
