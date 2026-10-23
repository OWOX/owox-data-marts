/**
 * Utility functions for validating DuckDB object names and formats.
 *
 * Mirrors the backend source of truth,
 * apps/backend/src/data-marts/data-storage-types/duckdb/utils/duckdb-validation.utils.ts.
 * DuckDB has no table-pattern variant — wildcards are never valid, so there is no
 * isValidDuckDbTablePattern export.
 */

const SCHEMA_TABLE = /^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Validates if a string matches the DuckDB fully qualified name pattern
 * Format: schema.table
 * @param value - The string to validate
 * @returns Boolean indicating if the string is valid
 */
export const isValidDuckDbFullyQualifiedName = (value: string): boolean => SCHEMA_TABLE.test(value);

/**
 * Returns validation error message for DuckDB fully qualified name
 * @param value - The string to validate
 * @returns Error message or empty string if valid
 */
export const getDuckDbFullyQualifiedNameError = (value: string): string => {
  if (!value) return 'Fully qualified name is required';
  if (!isValidDuckDbFullyQualifiedName(value)) {
    return 'Invalid format. Expected: schema.table';
  }
  return '';
};
