/**
 * Validation utilities for Databricks fully qualified names and table patterns
 * Format: catalog.schema.table
 */

/**
 * Validates if a string matches the Databricks fully qualified name format (catalog.schema.table)
 */
export const isValidDatabricksFullyQualifiedName = (value: string): boolean => {
  if (!value) return false;

  // Format: catalog.schema.table
  // Allow alphanumeric, underscore, and backticks for quoting
  const pattern = /^[a-zA-Z0-9_`]+\.[a-zA-Z0-9_`]+\.[a-zA-Z0-9_`]+$/;
  return pattern.test(value);
};

/**
 * Validates if a string matches the Databricks table pattern format
 * Supports wildcards (*) for pattern matching
 */
export const isValidDatabricksTablePattern = (value: string): boolean => {
  if (!value) return false;

  // Format: catalog.schema.table_pattern
  // Allow wildcards for pattern matching
  const pattern = /^[a-zA-Z0-9_`]+\.[a-zA-Z0-9_`]+\.[a-zA-Z0-9_*`]+$/;
  return pattern.test(value);
};

/**
 * Returns a validation error message for Databricks fully qualified name
 */
export const getDatabricksFullyQualifiedNameError = (value: string): string => {
  if (!value) return 'Fully qualified name is required';

  if (!isValidDatabricksFullyQualifiedName(value)) {
    return 'Invalid format. Expected: catalog.schema.table (e.g., main.my_schema.my_table)';
  }

  return '';
};

/**
 * Returns a validation error message for Databricks table pattern
 */
export const getDatabricksTablePatternError = (value: string): string => {
  if (!value) return 'Table pattern is required';

  if (!isValidDatabricksTablePattern(value)) {
    return 'Invalid format. Expected: catalog.schema.table_pattern (e.g., main.my_schema.table_*)';
  }

  return '';
};
