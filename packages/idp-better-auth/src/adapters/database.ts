import type { DatabaseConfig, SqliteConfig, MySqlConfig } from '../types/index.js';

/**
 * Create SQLite database adapter for Better Auth
 */
export async function createSqliteAdapter(config: SqliteConfig): Promise<unknown> {
  // Dynamic import to handle optional dependency
  const { default: Database } = await import('better-sqlite3');
  return new (Database as new (filename: string) => unknown)(config.filename || './better-auth.db');
}

/**
 * Create MySQL database adapter for Better Auth
 */
export async function createMysqlAdapter(config: MySqlConfig): Promise<unknown> {
  try {
    // Dynamic import to handle optional dependency
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
 * Create appropriate database adapter based on configuration
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
