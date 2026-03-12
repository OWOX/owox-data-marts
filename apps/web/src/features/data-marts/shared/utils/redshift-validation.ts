/**
 * Validation utilities for AWS Redshift object names
 */

/** Format: schema.object or database.schema.object (hyphens NOT allowed) */
export const isValidRedshiftFullyQualifiedName = (value: string): boolean => {
  if (!value) return false;

  const twoLevelPattern = /^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+$/;
  const threeLevelPattern = /^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+$/;

  return twoLevelPattern.test(value) || threeLevelPattern.test(value);
};

/** Format: schema.table_* or database.schema.table_* (with wildcard) */
export const isValidRedshiftTablePattern = (value: string): boolean => {
  if (!value) return false;

  const twoLevelPatternRegex = /^[a-zA-Z0-9_]+\.[a-zA-Z0-9_*]+$/;
  const threeLevelPatternRegex = /^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_*]+$/;

  return twoLevelPatternRegex.test(value) || threeLevelPatternRegex.test(value);
};

export const getRedshiftFullyQualifiedNameError = (value: string): string => {
  if (!value) return 'Fully qualified name is required';
  if (!isValidRedshiftFullyQualifiedName(value)) {
    return 'Invalid format. Expected: schema.object or database.schema.object';
  }
  return '';
};

export const getRedshiftTablePatternError = (value: string): string => {
  if (!value) return 'Table pattern is required';
  if (!isValidRedshiftTablePattern(value)) {
    return 'Invalid format. Expected: schema.table_* or database.schema.table_* (with wildcards)';
  }
  return '';
};
