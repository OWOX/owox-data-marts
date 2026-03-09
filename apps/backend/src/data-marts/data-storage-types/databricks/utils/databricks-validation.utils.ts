/**
 * Backend validation utilities for Databricks fully qualified names
 * Format: catalog.schema.table
 *
 * @see {@link https://docs.databricks.com/en/sql/language-manual/sql-ref-names.html} Databricks Naming Rules
 */

/**
 * Validates if a string matches the Databricks fully qualified name pattern
 * Format: catalog.schema.table
 * Only alphanumeric characters and underscores are allowed
 * Backtick quoting is NOT allowed to prevent SQL injection
 * @param value - The string to validate
 * @returns Boolean indicating if the string is valid
 * @see {@link https://docs.databricks.com/en/sql/language-manual/sql-ref-names.html} Databricks Unity Catalog Naming Rules
 */
export const isValidDatabricksFullyQualifiedName = (value: string): boolean => {
  if (!value) return false;

  const pattern = /^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+$/;
  return pattern.test(value);
};

/**
 * Validates if a string matches the Databricks table pattern format
 * Format: catalog.schema.table_* (with wildcard)
 * Only alphanumeric characters, underscores, and wildcards are allowed
 * Backtick quoting is NOT allowed to prevent SQL injection
 * @param value - The string to validate
 * @returns Boolean indicating if the string is valid
 * @see {@link https://docs.databricks.com/en/sql/language-manual/sql-ref-names.html} Databricks Unity Catalog Naming Rules
 */
export const isValidDatabricksTablePattern = (value: string): boolean => {
  if (!value) return false;

  const pattern = /^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_*]+$/;
  return pattern.test(value);
};
