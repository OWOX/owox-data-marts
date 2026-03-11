/**
 * Utility functions for validating AWS Redshift object names and formats
 */

/**
 * Validates if a string matches the AWS Redshift fully qualified name pattern
 * Format: schema.object or database.schema.object
 * @param value - The string to validate
 * @returns Boolean indicating if the string is valid
 */
export const isValidRedshiftFullyQualifiedName = (value: string): boolean => {
  if (!value) return false;

  // Identifier can be:
  // - Unquoted: [a-zA-Z0-9_-]+
  // - Quoted: "[^"]+"
  const identifier = '(?:[a-zA-Z0-9_-]+|"[^"]+")';

  // Two formats are valid:
  // 1. schema.object (2-level hierarchy)
  // 2. database.schema.object (3-level hierarchy)
  const twoLevelPattern = new RegExp(`^${identifier}\\.${identifier}$`);
  const threeLevelPattern = new RegExp(`^${identifier}\\.${identifier}\\.${identifier}$`);

  return twoLevelPattern.test(value) || threeLevelPattern.test(value);
};

/**
 * Validates if a string matches the AWS Redshift table pattern format
 * Format: schema.table_* (with wildcard)
 * @param value - The string to validate
 * @returns Boolean indicating if the string is valid
 */
export const isValidRedshiftTablePattern = (value: string): boolean => {
  if (!value) return false;

  // Identifier can be:
  // - Unquoted: [a-zA-Z0-9_-]+ (with optional wildcards for table names)
  // - Quoted: "[^"]+"
  const identifier = '(?:[a-zA-Z0-9_-]+|"[^"]+")';
  const identifierWithWildcard = '(?:[a-zA-Z0-9_\\-*]+|"[^"]+")';

  // Two formats are valid:
  // 1. schema.table_* (2-level hierarchy with wildcards)
  // 2. database.schema.table_* (3-level hierarchy with wildcards)
  const twoLevelPatternRegex = new RegExp(`^${identifier}\\.${identifierWithWildcard}$`);
  const threeLevelPatternRegex = new RegExp(
    `^${identifier}\\.${identifier}\\.${identifierWithWildcard}$`
  );

  return twoLevelPatternRegex.test(value) || threeLevelPatternRegex.test(value);
};

/**
 * Returns validation error message for AWS Redshift fully qualified name
 * @param value - The string to validate
 * @returns Error message or empty string if valid
 */
export const getRedshiftFullyQualifiedNameError = (value: string): string => {
  if (!value) return 'Fully qualified name is required';
  if (!isValidRedshiftFullyQualifiedName(value)) {
    return 'Invalid format. Expected: schema.object or database.schema.object';
  }
  return '';
};

/**
 * Returns validation error message for AWS Redshift table pattern
 * @param value - The string to validate
 * @returns Error message or empty string if valid
 */
export const getRedshiftTablePatternError = (value: string): string => {
  if (!value) return 'Table pattern is required';
  if (!isValidRedshiftTablePattern(value)) {
    return 'Invalid format. Expected: schema.table_* or database.schema.table_* (with wildcards)';
  }
  return '';
};
