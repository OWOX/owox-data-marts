/**
 * Validation utilities for Databricks fully qualified names
 */

/** Format: catalog.schema.table */
export const isValidDatabricksFullyQualifiedName = (value: string): boolean => {
  if (!value) return false;

  const pattern = /^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+$/;
  return pattern.test(value);
};

/** Format: catalog.schema.table_* (with wildcard) */
export const isValidDatabricksTablePattern = (value: string): boolean => {
  if (!value) return false;

  const pattern = /^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_*]+$/;
  return pattern.test(value);
};

export const getDatabricksFullyQualifiedNameError = (value: string): string => {
  if (!value) return 'Fully qualified name is required';

  if (!isValidDatabricksFullyQualifiedName(value)) {
    return 'Invalid format. Expected: catalog.schema.table (e.g., main.my_schema.my_table)';
  }

  return '';
};

export const getDatabricksTablePatternError = (value: string): string => {
  if (!value) return 'Table pattern is required';

  if (!isValidDatabricksTablePattern(value)) {
    return 'Invalid format. Expected: catalog.schema.table_pattern (e.g., main.my_schema.table_*)';
  }

  return '';
};
