/**
 * Backend path resolution utilities for the DuckDB storage type.
 *
 * DuckDB is a file-backed storage: each data storage maps to a single
 * `<storageId>.duckdb` file inside a configurable data directory.
 */

import { ConfigService } from '@nestjs/config';
import * as path from 'node:path';
import { resolveSqliteDatabasePath } from '../../../../config/get-sqlite-database-path';

/**
 * Resolves the directory used to hold DuckDB database files.
 *
 * @param configService - application config service
 * @returns absolute `DUCKDB_DATA_DIR`, or `<SQLite database directory>/duckdb` when unset
 */
export function resolveDuckDbDataDir(configService: ConfigService): string {
  const dir = configService.get<string>('DUCKDB_DATA_DIR');
  return dir
    ? path.resolve(dir)
    : path.resolve(path.dirname(resolveSqliteDatabasePath(configService)), 'duckdb');
}

/**
 * Resolves the absolute path of the `.duckdb` file for a given storage id.
 *
 * @param configService - application config service
 * @param storageId - data storage id
 * @returns `<dataDir>/<storageId>.duckdb`
 */
export function resolveDuckDbDatabasePath(configService: ConfigService, storageId: string): string {
  return path.join(resolveDuckDbDataDir(configService), `${storageId}.duckdb`);
}
