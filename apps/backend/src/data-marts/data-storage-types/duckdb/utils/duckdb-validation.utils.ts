/**
 * Backend validation utilities for DuckDB fully qualified names
 */

const SCHEMA_TABLE = /^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/;

/** Format: schema.table */
export const isValidDuckDbFullyQualifiedName = (value: string): boolean => SCHEMA_TABLE.test(value);
