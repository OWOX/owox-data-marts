import { ConfigService } from '@nestjs/config';
import * as path from 'node:path';
import { resolveDuckDbDataDir, resolveDuckDbDatabasePath } from './duckdb-path.utils';
import { isValidDuckDbFullyQualifiedName } from './duckdb-validation.utils';

const cfg = (values: { SQLITE_DB_PATH?: string; DUCKDB_DATA_DIR?: string } = {}) =>
  ({
    get: (key: string) => (values as Record<string, string | undefined>)[key],
  }) as unknown as ConfigService;

describe('duckdb path + validation utils', () => {
  it('defaults the data dir to <sqlite dir>/duckdb', () => {
    expect(resolveDuckDbDataDir(cfg({ SQLITE_DB_PATH: '/srv/owox/sqlite/app.db' }))).toBe(
      '/srv/owox/sqlite/duckdb'
    );
  });
  it('prefers DUCKDB_DATA_DIR', () => {
    expect(
      resolveDuckDbDataDir(cfg({ SQLITE_DB_PATH: '/a/app.db', DUCKDB_DATA_DIR: '/data/duck' }))
    ).toBe('/data/duck');
  });
  it('resolves a relative SQLite path to an absolute DuckDB dir', () => {
    expect(resolveDuckDbDataDir(cfg({ SQLITE_DB_PATH: './database/backend.db' }))).toBe(
      path.resolve('./database/duckdb')
    );
  });
  it('resolves a relative DUCKDB_DATA_DIR to an absolute path', () => {
    expect(resolveDuckDbDataDir(cfg({ DUCKDB_DATA_DIR: './duck' }))).toBe(path.resolve('./duck'));
  });
  it('derives <dir>/<storageId>.duckdb', () => {
    expect(resolveDuckDbDatabasePath(cfg({ DUCKDB_DATA_DIR: '/data/duck' }), 'abc-123')).toBe(
      '/data/duck/abc-123.duckdb'
    );
  });
  it('accepts schema.table only, rejects injection', () => {
    expect(isValidDuckDbFullyQualifiedName('main.orders')).toBe(true);
    expect(isValidDuckDbFullyQualifiedName('_s.t_1')).toBe(true);
    expect(isValidDuckDbFullyQualifiedName('memory.main.data')).toBe(false);
    expect(isValidDuckDbFullyQualifiedName('main.my-table')).toBe(false);
    expect(isValidDuckDbFullyQualifiedName('1s.t')).toBe(false);
    expect(isValidDuckDbFullyQualifiedName('orders')).toBe(false);
    expect(isValidDuckDbFullyQualifiedName("main.orders'; DROP")).toBe(false);
  });
});
