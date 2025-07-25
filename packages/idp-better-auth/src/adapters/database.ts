import type { DatabaseConfig, SqliteConfig, MySqlConfig } from '../types/index.js';

/**
 * Create SQLite database adapter for Better Auth
 */
export async function createSqliteAdapter(config: SqliteConfig): Promise<any> {
  try {
    // Dynamic import to handle optional dependency
    const { default: Database } = await import('better-sqlite3');
    return new Database(config.filename || './better-auth.db');
  } catch (error) {
    throw new Error(
      'better-sqlite3 is required for SQLite support. Install it with: npm install better-sqlite3'
    );
  }
}

/**
 * Create MySQL database adapter for Better Auth
 */
export async function createMysqlAdapter(config: MySqlConfig): Promise<any> {
  try {
    // Dynamic import to handle optional dependency
    const mysql = await import('mysql2/promise');

    return mysql.default.createPool({
      host: config.host,
      user: config.user,
      password: config.password,
      database: config.database,
      port: config.port || 3306,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  } catch (error) {
    throw new Error('mysql2 is required for MySQL support. Install it with: npm install mysql2');
  }
}

/**
 * Create appropriate database adapter based on configuration
 */
export async function createDatabaseAdapter(config: DatabaseConfig): Promise<any> {
  switch (config.type) {
    case 'sqlite':
      return await createSqliteAdapter(config);
    case 'mysql':
      return await createMysqlAdapter(config);
    default:
      throw new Error(`Unsupported database type: ${(config as any).type}`);
  }
}
