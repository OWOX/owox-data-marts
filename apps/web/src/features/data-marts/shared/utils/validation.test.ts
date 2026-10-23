import { describe, it, expect } from 'vitest';
import { DataStorageType } from '../../../data-storage';
import {
  getFullyQualifiedNameError,
  getFullyQualifiedNameHelpText,
  getFullyQualifiedNamePlaceholder,
  getTablePatternError,
  isValidFullyQualifiedName,
  isValidTablePattern,
} from './validation';

describe('validation.ts — DUCKDB cases', () => {
  it('isValidFullyQualifiedName delegates to DuckDB FQN validation', () => {
    expect(isValidFullyQualifiedName('main.data', DataStorageType.DUCKDB)).toBe(true);
    expect(isValidFullyQualifiedName('main.data_*', DataStorageType.DUCKDB)).toBe(false);
  });

  it('getFullyQualifiedNameError returns the DuckDB-specific message', () => {
    expect(getFullyQualifiedNameError('not-valid', DataStorageType.DUCKDB)).toBe(
      'Invalid format. Expected: schema.table'
    );
    expect(getFullyQualifiedNameError('main.data', DataStorageType.DUCKDB)).toBe('');
  });

  it('getFullyQualifiedNamePlaceholder returns the DuckDB placeholder', () => {
    expect(getFullyQualifiedNamePlaceholder(DataStorageType.DUCKDB)).toBe('schema.table');
  });

  it('getFullyQualifiedNameHelpText returns DuckDB-specific help text', () => {
    expect(getFullyQualifiedNameHelpText(DataStorageType.DUCKDB)).toBe(
      'Enter the fully qualified name of the table (e.g., schema.table)'
    );
  });

  it('isValidTablePattern always returns false for DuckDB (unsupported)', () => {
    expect(isValidTablePattern('main.data_*', DataStorageType.DUCKDB)).toBe(false);
    expect(isValidTablePattern('main.data', DataStorageType.DUCKDB)).toBe(false);
  });

  it('getTablePatternError returns a clear unsupported message for DuckDB', () => {
    expect(getTablePatternError('main.data_*', DataStorageType.DUCKDB)).toBe(
      'DuckDB does not support table patterns'
    );
  });
});
