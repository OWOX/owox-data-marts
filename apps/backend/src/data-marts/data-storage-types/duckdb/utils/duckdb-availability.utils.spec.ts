import { isDuckDbStorageEnabled } from './duckdb-availability.utils';

describe('isDuckDbStorageEnabled', () => {
  it.each<[{ DUCKDB_STORAGE_ENABLED?: string; DB_TYPE?: string }, boolean]>([
    [{}, true],
    [{ DB_TYPE: 'sqlite' }, true],
    [{ DB_TYPE: 'mysql' }, false],
    [{ DB_TYPE: 'sqlite', DUCKDB_STORAGE_ENABLED: 'false' }, false],
    [{ DB_TYPE: 'mysql', DUCKDB_STORAGE_ENABLED: 'TRUE' }, true],
    [{ DB_TYPE: 'mysql', DUCKDB_STORAGE_ENABLED: ' ' }, false],
  ])('%j -> %s', (values, expected) => {
    expect(isDuckDbStorageEnabled(values)).toBe(expected);
  });
});
