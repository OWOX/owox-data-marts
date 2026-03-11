/**
 * Backend validation utilities for Snowflake fully qualified names
 * Format: database.schema.table
 *
 * @see {@link https://docs.snowflake.com/en/sql-reference/identifiers.html} Snowflake Identifier Syntax
 */

<<<<<<< Updated upstream
import {
  createFullyQualifiedNameValidator,
  createTablePatternValidator,
  StorageValidationConfig,
} from '../../utils/validation.utils';

export const SNOWFLAKE_VALIDATION_CONFIG: StorageValidationConfig = {
  allowedChars: 'a-zA-Z0-9_$',
  allowTwoLevel: false,
};
=======
import { createIdentifierValidator } from '../../utils/validation.utils';

const ALLOWED_CHARS = 'a-zA-Z0-9_$';
>>>>>>> Stashed changes

/**
 * Validates if a string matches the Snowflake fully qualified name pattern
 * Format: database.schema.table
 * Only alphanumeric characters, underscores, and dollar signs are allowed
 * Quoted identifiers are NOT allowed to prevent SQL injection
 * @see {@link https://docs.snowflake.com/en/sql-reference/identifiers.html} Snowflake Identifier Syntax
 */
<<<<<<< Updated upstream
export const isValidSnowflakeFullyQualifiedName = createFullyQualifiedNameValidator(
  SNOWFLAKE_VALIDATION_CONFIG
);
=======
export const isValidSnowflakeFullyQualifiedName = createIdentifierValidator({
  allowedChars: ALLOWED_CHARS,
  allowTwoLevel: false,
  allowWildcard: false,
});
>>>>>>> Stashed changes

/**
 * Validates if a string matches the Snowflake table pattern format
 * Format: database.schema.table_* (with wildcard)
 * Only alphanumeric characters, underscores, dollar signs, and wildcards are allowed
 * Quoted identifiers are NOT allowed to prevent SQL injection
 * @see {@link https://docs.snowflake.com/en/sql-reference/identifiers.html} Snowflake Identifier Syntax
 */
<<<<<<< Updated upstream
export const isValidSnowflakeTablePattern = createTablePatternValidator(
  SNOWFLAKE_VALIDATION_CONFIG
);
=======
export const isValidSnowflakeTablePattern = createIdentifierValidator({
  allowedChars: ALLOWED_CHARS,
  allowTwoLevel: false,
  allowWildcard: true,
});
>>>>>>> Stashed changes
