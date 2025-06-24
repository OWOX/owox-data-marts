/**
 * Utility functions for validating BigQuery object names and formats
 */

/**
 * Validates if a string matches the BigQuery fully qualified name pattern
 * Format: project.dataset.object
 * @param value - The string to validate
 * @returns Boolean indicating if the string is valid
 */
export const isValidBigQueryFullyQualifiedName = (value: string): boolean => {
  if (!value) return false;

  // Basic format validation: project.dataset.object
  const bigQueryPattern = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/;
  return bigQueryPattern.test(value);
};

/**
 * Validates if a string matches the BigQuery table pattern format
 * Format: project.dataset.table_* (with wildcard)
 * @param value - The string to validate
 * @returns Boolean indicating if the string is valid
 */
export const isValidBigQueryTablePattern = (value: string): boolean => {
  if (!value) return false;

  // Project and dataset must be specified explicitly, but table name can have wildcards
  const patternRegex = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_\-*]+$/;
  return patternRegex.test(value);
};

/**
 * Returns validation error message for BigQuery fully qualified name
 * @param value - The string to validate
 * @returns Error message or empty string if valid
 */
export const getBigQueryFullyQualifiedNameError = (value: string): string => {
  if (!value) return 'Fully qualified name is required';
  if (!isValidBigQueryFullyQualifiedName(value)) {
    return 'Invalid format. Expected: project.dataset.object';
  }
  return '';
};

/**
 * Returns validation error message for BigQuery table pattern
 * @param value - The string to validate
 * @returns Error message or empty string if valid
 */
export const getBigQueryTablePatternError = (value: string): string => {
  if (!value) return 'Table pattern is required';
  if (!isValidBigQueryTablePattern(value)) {
    return 'Invalid format. Expected: project.dataset.table_* (with wildcards)';
  }
  return '';
};
