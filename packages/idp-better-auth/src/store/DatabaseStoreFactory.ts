import envPaths from 'env-paths';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import type { DatabaseConfig, MySqlConfig, SqliteConfig } from '../types/index.js';
import type { DatabaseStore } from './DatabaseStore.js';
import { MysqlDatabaseStore } from './MysqlDatabaseStore.js';
import { SqliteDatabaseStore } from './SqliteDatabaseStore.js';

function getIdpSqliteDatabasePath(): string {
  const paths = envPaths('owox', { suffix: '' });
  const dbPath = join(paths.data, 'idp', 'auth.db');
  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    try {
      mkdirSync(dbDir, { recursive: true });
    } catch (error) {
      throw new Error(
        `Failed to create IDP SQLite database directory: ${dbDir}. ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return dbPath;
}

export function createDatabaseStore(database: DatabaseConfig): DatabaseStore {
  switch (database.type) {
    case 'sqlite': {
      const cfg = database as SqliteConfig;
      const dbPath = cfg.filename || getIdpSqliteDatabasePath();
      return new SqliteDatabaseStore(dbPath);
    }
    case 'mysql': {
      const cfg = database as MySqlConfig;
      return new MysqlDatabaseStore({
        host: cfg.host,
        user: cfg.user,
        password: cfg.password,
        database: cfg.database,
        port: cfg.port ?? 3306,
      });
    }
    default:
      throw new Error(
        `Unsupported database type for store: ${(database as { type: string }).type}`
      );
  }
}
