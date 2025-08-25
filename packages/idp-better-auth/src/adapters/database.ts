import type { DatabaseConfig, SqliteConfig, MySqlConfig } from '../types/index.js';
import envPaths from 'env-paths';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

/**
 * Determines the SQLite database file path for IDP based on configuration.
 *
 * If `IDP_SQLITE_DB_PATH` environment variable is set, uses that path directly.
 * Otherwise, uses cross-platform application data directory with 'owox/idp/auth.db' structure.
 * Automatically creates the database directory if it doesn't exist.
 *
 * @returns The absolute path to the SQLite database file for IDP
 * @throws {Error} When database directory cannot be created due to permissions or other filesystem errors
 */
function getIdpSqliteDatabasePath(): string {
  const envDbPath = process.env.IDP_SQLITE_DB_PATH;

  let dbPath: string;

  if (envDbPath) {
    console.log(`Using IDP SQLite database path from \`IDP_SQLITE_DB_PATH\` env: ${envDbPath}`);
    dbPath = envDbPath;
  } else {
    const paths = envPaths('owox', { suffix: '' });
    dbPath = join(paths.data, 'idp', 'auth.db');
    console.log(`Using system app data directory for IDP SQLite: ${dbPath}`);
  }

  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    try {
      mkdirSync(dbDir, { recursive: true });
      console.log(`Created IDP SQLite database directory: ${dbDir}`);
    } catch (error) {
      throw new Error(
        `Failed to create IDP SQLite database directory: ${dbDir}. ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return dbPath;
}

/**
 * Create SQLite database adapter for Better Auth
 */
export async function createSqliteAdapter(config: SqliteConfig): Promise<unknown> {
  // Dynamic import to handle optional dependency
  const { default: Database } = await import('better-sqlite3');

  // Use configured path or default to smart path resolution
  const dbPath = config.filename || getIdpSqliteDatabasePath();

  return new (Database as new (filename: string) => unknown)(dbPath);
}

/**
 * Create MySQL database adapter for Better Auth
 */
export async function createMysqlAdapter(config: MySqlConfig): Promise<unknown> {
  try {
    const mysql = await import('mysql2/promise');

    return (mysql as { default: { createPool: (config: unknown) => unknown } }).default.createPool({
      host: config.host,
      user: config.user,
      password: config.password,
      database: config.database,
      port: config.port || 3306,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  } catch {
    throw new Error('mysql2 is required for MySQL support. Install it with: npm install mysql2');
  }
}

/**
 * Create database adapter based on configuration
 */
export async function createDatabaseAdapter(config: DatabaseConfig): Promise<unknown> {
  switch (config.type) {
    case 'sqlite':
      return await createSqliteAdapter(config);
    case 'mysql':
      return await createMysqlAdapter(config);
    default:
      throw new Error(`Unsupported database type: ${(config as { type: string }).type}`);
  }
}

/**
 * Export the IDP SQLite database path function for external use
 */
export { getIdpSqliteDatabasePath };
