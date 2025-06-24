/**
 * Utility functions for validating AWS Athena object names and formats
 */

/**
 * Validates if a string matches the AWS Athena fully qualified name pattern
 * Format: database.object or catalog.database.object
 * @param value - The string to validate
 * @returns Boolean indicating if the string is valid
 */
export const isValidAthenaFullyQualifiedName = (value: string): boolean => {
  if (!value) return false;

  // Two formats are valid:
  // 1. database.object (2-level hierarchy)
  // 2. catalog.database.object (3-level hierarchy)
  const twoLevelPattern = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/;
  const threeLevelPattern = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/;

  return twoLevelPattern.test(value) || threeLevelPattern.test(value);
};

/**
 * Validates if a string matches the AWS Athena table pattern format
 * Format: database.table_* (with wildcard)
 * @param value - The string to validate
 * @returns Boolean indicating if the string is valid
 */
export const isValidAthenaTablePattern = (value: string): boolean => {
  if (!value) return false;

  // Two formats are valid:
  // 1. database.table_* (2-level hierarchy with wildcards)
  // 2. catalog.database.table_* (3-level hierarchy with wildcards)
  const twoLevelPatternRegex = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_\-*]+$/;
  const threeLevelPatternRegex = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_\-*]+$/;

  return twoLevelPatternRegex.test(value) || threeLevelPatternRegex.test(value);
};

/**
 * Returns validation error message for AWS Athena fully qualified name
 * @param value - The string to validate
 * @returns Error message or empty string if valid
 */
export const getAthenaFullyQualifiedNameError = (value: string): string => {
  if (!value) return 'Fully qualified name is required';
  if (!isValidAthenaFullyQualifiedName(value)) {
    return 'Invalid format. Expected: database.object or catalog.database.object';
  }
  return '';
};

/**
 * Returns validation error message for AWS Athena table pattern
 * @param value - The string to validate
 * @returns Error message or empty string if valid
 */
export const getAthenaTablePatternError = (value: string): string => {
  if (!value) return 'Table pattern is required';
  if (!isValidAthenaTablePattern(value)) {
    return 'Invalid format. Expected: database.table_* or catalog.database.table_* (with wildcards)';
  }
  return '';
};
