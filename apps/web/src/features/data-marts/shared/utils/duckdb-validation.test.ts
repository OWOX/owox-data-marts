import { describe, it, expect } from 'vitest';
import {
  isValidDuckDbFullyQualifiedName,
  getDuckDbFullyQualifiedNameError,
} from './duckdb-validation';

describe('isValidDuckDbFullyQualifiedName', () => {
  it('accepts a two-level schema.table name', () => {
    expect(isValidDuckDbFullyQualifiedName('main.data')).toBe(true);
  });

  it('accepts mixed-case letters, digits and underscores', () => {
    expect(isValidDuckDbFullyQualifiedName('main.Data_1')).toBe(true);
    expect(isValidDuckDbFullyQualifiedName('_s.t_1')).toBe(true);
  });

  it('rejects a three-level catalog.schema.table name', () => {
    expect(isValidDuckDbFullyQualifiedName('memory.main.data')).toBe(false);
  });

  it('rejects hyphens and a leading digit', () => {
    expect(isValidDuckDbFullyQualifiedName('main.Data_1-a')).toBe(false);
    expect(isValidDuckDbFullyQualifiedName('main.1data')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidDuckDbFullyQualifiedName('')).toBe(false);
  });

  it('rejects a single segment with no dot', () => {
    expect(isValidDuckDbFullyQualifiedName('table')).toBe(false);
  });

  it('rejects four or more segments', () => {
    expect(isValidDuckDbFullyQualifiedName('a.b.c.d')).toBe(false);
  });

  it('rejects a wildcard — table patterns are not supported', () => {
    expect(isValidDuckDbFullyQualifiedName('main.data_*')).toBe(false);
  });
});

describe('getDuckDbFullyQualifiedNameError', () => {
  it('returns a required-field message for an empty string', () => {
    expect(getDuckDbFullyQualifiedNameError('')).toBe('Fully qualified name is required');
  });

  it('returns a format message for an invalid value', () => {
    expect(getDuckDbFullyQualifiedNameError('table')).toBe(
      'Invalid format. Expected: schema.table'
    );
  });

  it('returns an empty string for a valid value', () => {
    expect(getDuckDbFullyQualifiedNameError('main.data')).toBe('');
  });
});
