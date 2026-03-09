/**
 * Backend validation utilities for BigQuery fully qualified names
 * Format: project.dataset.table
 */

/**
 * Validates if a string matches the BigQuery fully qualified name pattern
 * Format: project.dataset.table
 * Only alphanumeric characters, underscores, and hyphens are allowed
 * Quoted identifiers are NOT allowed to prevent SQL injection
 * @param value - The string to validate
 * @returns Boolean indicating if the string is valid
 */
export const isValidBigQueryFullyQualifiedName = (value: string): boolean => {
  if (!value) return false;
  // Format: project.dataset.table
  const pattern = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/;
  return pattern.test(value);
};
