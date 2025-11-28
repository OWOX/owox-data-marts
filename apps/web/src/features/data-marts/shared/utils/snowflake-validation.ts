/**
 * Utility functions for validating Snowflake object names and formats
 */

/**
 * Validates if a string matches the Snowflake fully qualified name pattern
 * Format: database.schema.object
 * Supports both unquoted and quoted identifiers (e.g., database."SCHEMA"."OBJECT")
 * @param value - The string to validate
 * @returns Boolean indicating if the string is valid
 */
export const isValidSnowflakeFullyQualifiedName = (value: string): boolean => {
  if (!value) return false;

  const identifier = '(?:[a-zA-Z0-9_$]+|"[^"]+")';
  const snowflakePattern = new RegExp(`^[a-zA-Z0-9_$]+\\.${identifier}\\.${identifier}$`);
  return snowflakePattern.test(value);
};

/**
 * Validates if a string matches the Snowflake table pattern format
 * Format: database.schema.table_* (with wildcard)
 * Supports both unquoted and quoted identifiers (e.g., database."SCHEMA".table_*)
 * @param value - The string to validate
 * @returns Boolean indicating if the string is valid
 */
export const isValidSnowflakeTablePattern = (value: string): boolean => {
  if (!value) return false;

  const schemaIdentifier = '(?:[a-zA-Z0-9_$]+|"[^"]+")';
  const tablePattern = '(?:[a-zA-Z0-9_$*]+|"[^"]+")';

  // Database and schema must be specified explicitly, but table name can have wildcards
  const patternRegex = new RegExp(`^[a-zA-Z0-9_$]+\\.${schemaIdentifier}\\.${tablePattern}$`);
  return patternRegex.test(value);
};

/**
 * Returns validation error message for Snowflake fully qualified name
 * @param value - The string to validate
 * @returns Error message or empty string if valid
 */
export const getSnowflakeFullyQualifiedNameError = (value: string): string => {
  if (!value) return 'Fully qualified name is required';
  if (!isValidSnowflakeFullyQualifiedName(value)) {
    return 'Invalid format. Expected: database.schema.object';
  }
  return '';
};

/**
 * Returns validation error message for Snowflake table pattern
 * @param value - The string to validate
 * @returns Error message or empty string if valid
 */
export const getSnowflakeTablePatternError = (value: string): string => {
  if (!value) return 'Table pattern is required';
  if (!isValidSnowflakeTablePattern(value)) {
    return 'Invalid format. Expected: database.schema.table_* (with wildcards)';
  }
  return '';
};
