import type { DbConfig } from '../config/idp-owox-config.js';
import type { DatabaseConfig, MySqlConfig, SqliteConfig } from '../types/index.js';
import type { DatabaseStore } from './database-store.js';
import { MysqlDatabaseStore } from './mysql-database-store.js';
import { SqliteDatabaseStore } from './sqlite-database-store.js';

function normalizeConfig(database: DatabaseConfig | DbConfig): DatabaseConfig {
  const config = database as DatabaseConfig;
  if (config.type === 'sqlite' || config.type === 'mysql') {
    return config;
  }

  throw new Error(`Unsupported database config shape: ${(database as { type?: string }).type ?? 'unknown'}`);
}

/**
 * Creates a database store implementation based on config.
 */
export function createDatabaseStore(database: DatabaseConfig | DbConfig): DatabaseStore {
  const normalized = normalizeConfig(database);
  switch (normalized.type) {
    case 'sqlite': {
      const cfg = normalized as SqliteConfig;
      if (!cfg.filename) {
        throw new Error('SQLite filename is required but missing');
      }
      const dbPath = cfg.filename;
      return new SqliteDatabaseStore(dbPath);
    }
    case 'mysql': {
      const cfg = normalized as MySqlConfig;
      return new MysqlDatabaseStore({
        host: cfg.host,
        user: cfg.user,
        password: cfg.password,
        database: cfg.database,
        port: cfg.port ?? 3306,
        ssl: cfg.ssl,
      });
    }
    default:
      throw new Error(
        `Unsupported database type for store: ${(normalized as { type: string }).type}`
      );
  }
}
