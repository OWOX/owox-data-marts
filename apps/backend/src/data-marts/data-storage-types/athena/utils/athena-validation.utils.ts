/**
 * Backend validation utilities for Athena fully qualified names
 * Format: database.table or catalog.database.table
 */

/**
 * Validates if a string matches the AWS Athena fully qualified name pattern
 * Format: database.table or catalog.database.table
 * Only alphanumeric characters, underscores, and hyphens are allowed
 * Quoted identifiers are NOT allowed to prevent SQL injection
 * @param value - The string to validate
 * @returns Boolean indicating if the string is valid
 */
export const isValidAthenaFullyQualifiedName = (value: string): boolean => {
  if (!value) return false;

  // Two formats are valid:
  // 1. database.table (2-level hierarchy)
  // 2. catalog.database.table (3-level hierarchy)
  const twoLevelPattern = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/;
  const threeLevelPattern = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/;

  return twoLevelPattern.test(value) || threeLevelPattern.test(value);
};

/**
 * Validates if a string matches the AWS Athena table pattern format
 * Format: database.table_* or catalog.database.table_* (with wildcard)
 * Only alphanumeric characters, underscores, hyphens, and wildcards are allowed
 * Quoted identifiers are NOT allowed to prevent SQL injection
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
