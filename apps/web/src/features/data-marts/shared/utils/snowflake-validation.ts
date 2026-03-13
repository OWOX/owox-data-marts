/**
 * Validation utilities for Snowflake object names
 */

/** Format: database.schema.object */
export const isValidSnowflakeFullyQualifiedName = (value: string): boolean => {
  if (!value) return false;

  const snowflakePattern = /^[a-zA-Z0-9_$]+\.[a-zA-Z0-9_$]+\.[a-zA-Z0-9_$]+$/;
  return snowflakePattern.test(value);
};

/** Format: database.schema.table_* (with wildcard) */
export const isValidSnowflakeTablePattern = (value: string): boolean => {
  if (!value) return false;

  const patternRegex = /^[a-zA-Z0-9_$]+\.[a-zA-Z0-9_$]+\.[a-zA-Z0-9_$*]+$/;
  return patternRegex.test(value);
};

export const getSnowflakeFullyQualifiedNameError = (value: string): string => {
  if (!value) return 'Fully qualified name is required';
  if (!isValidSnowflakeFullyQualifiedName(value)) {
    return 'Invalid format. Expected: database.schema.object';
  }
  return '';
};

export const getSnowflakeTablePatternError = (value: string): string => {
  if (!value) return 'Table pattern is required';
  if (!isValidSnowflakeTablePattern(value)) {
    return 'Invalid format. Expected: database.schema.table_* (with wildcards)';
  }
  return '';
};
