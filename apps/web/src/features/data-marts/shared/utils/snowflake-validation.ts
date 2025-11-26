/**
 * Utility functions for validating Snowflake object names and formats
 */

/**
 * Validates if a string matches the Snowflake fully qualified name pattern
 * Format: database.schema.object
 * @param value - The string to validate
 * @returns Boolean indicating if the string is valid
 */
export const isValidSnowflakeFullyQualifiedName = (value: string): boolean => {
  if (!value) return false;

  // Basic format validation: database.schema.object
  // Snowflake identifiers can contain letters, numbers, underscores, and dollar signs
  const snowflakePattern = /^[a-zA-Z0-9_$]+\.[a-zA-Z0-9_$]+\.[a-zA-Z0-9_$]+$/;
  return snowflakePattern.test(value);
};

/**
 * Validates if a string matches the Snowflake table pattern format
 * Format: database.schema.table_* (with wildcard)
 * @param value - The string to validate
 * @returns Boolean indicating if the string is valid
 */
export const isValidSnowflakeTablePattern = (value: string): boolean => {
  if (!value) return false;

  // Database and schema must be specified explicitly, but table name can have wildcards
  const patternRegex = /^[a-zA-Z0-9_$]+\.[a-zA-Z0-9_$]+\.[a-zA-Z0-9_$*]+$/;
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
