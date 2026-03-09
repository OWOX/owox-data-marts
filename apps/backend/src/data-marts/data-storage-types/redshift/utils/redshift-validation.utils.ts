/**
 * Backend validation utilities for Redshift fully qualified names
 * Format: schema.table or database.schema.table
 *
 * @see {@link https://docs.aws.amazon.com/redshift/latest/dg/r_names.html} AWS Redshift Identifier Rules
 */

/**
 * Validates if a string matches the AWS Redshift fully qualified name pattern
 * Format: schema.table or database.schema.table
 * Only alphanumeric characters and underscores are allowed
 * Hyphens are NOT allowed in unquoted Redshift identifiers
 * Quoted identifiers are NOT allowed to prevent SQL injection
 * @param value - The string to validate
 * @returns Boolean indicating if the string is valid
 * @see {@link https://docs.aws.amazon.com/redshift/latest/dg/r_names.html} AWS Redshift Naming Rules
 */
export const isValidRedshiftFullyQualifiedName = (value: string): boolean => {
  if (!value) return false;

  // Two formats are valid:
  // 1. schema.table (2-level hierarchy)
  // 2. database.schema.table (3-level hierarchy)
  const twoLevelPattern = /^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+$/;
  const threeLevelPattern = /^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+$/;

  return twoLevelPattern.test(value) || threeLevelPattern.test(value);
};

/**
 * Validates if a string matches the AWS Redshift table pattern format
 * Format: schema.table_* or database.schema.table_* (with wildcard)
 * Only alphanumeric characters, underscores, and wildcards are allowed
 * Hyphens are NOT allowed in unquoted Redshift identifiers
 * Quoted identifiers are NOT allowed to prevent SQL injection
 * @param value - The string to validate
 * @returns Boolean indicating if the string is valid
 * @see {@link https://docs.aws.amazon.com/redshift/latest/dg/r_names.html} AWS Redshift Naming Rules
 */
export const isValidRedshiftTablePattern = (value: string): boolean => {
  if (!value) return false;

  // Two formats are valid:
  // 1. schema.table_* (2-level hierarchy with wildcards)
  // 2. database.schema.table_* (3-level hierarchy with wildcards)
  const twoLevelPatternRegex = /^[a-zA-Z0-9_]+\.[a-zA-Z0-9_*]+$/;
  const threeLevelPatternRegex = /^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_*]+$/;

  return twoLevelPatternRegex.test(value) || threeLevelPatternRegex.test(value);
};
