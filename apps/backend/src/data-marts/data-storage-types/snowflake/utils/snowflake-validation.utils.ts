/**
 * Backend validation utilities for Snowflake fully qualified names
 * @see {@link https://docs.snowflake.com/en/sql-reference/identifiers.html} Snowflake Identifier Syntax
 */

import { createIdentifierValidator } from '../../utils/validation.utils';

const ALLOWED_CHARS = 'a-zA-Z0-9_$';

/** Format: database.schema.table or database."schema"."table" (quoted segments) */
export const isValidSnowflakeFullyQualifiedName = createIdentifierValidator({
  allowedChars: ALLOWED_CHARS,
  allowTwoLevel: false,
  allowWildcard: false,
  allowQuotedSegments: true,
});

/** Format: database.schema.table_* (with wildcard) */
export const isValidSnowflakeTablePattern = createIdentifierValidator({
  allowedChars: ALLOWED_CHARS,
  allowTwoLevel: false,
  allowWildcard: true,
});
