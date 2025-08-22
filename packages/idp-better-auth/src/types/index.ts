/**
 * SQLite database configuration
 */
export interface SqliteConfig {
  type: 'sqlite';
  filename: string;
}

/**
 * MySQL database configuration
 */
export interface MySqlConfig {
  type: 'mysql';
  host: string;
  user: string;
  password: string;
  database: string;
  port?: number;
}

export type Role = 'admin' | 'editor' | 'viewer';

/**
 * Custom database adapter (for advanced use cases)
 */
export interface CustomDatabaseConfig {
  type: 'custom';
  adapter: unknown;
}

export type DatabaseConfig = SqliteConfig | MySqlConfig | CustomDatabaseConfig;

export interface BetterAuthConfig {
  database: DatabaseConfig;
  emailAndPassword?: {
    enabled: boolean;
    requireEmailVerification?: boolean;
    sendEmailVerification?: (email: string, url: string, token: string) => Promise<void>;
  };
  session?: {
    maxAge?: number;
  };
  trustedOrigins?: string[];
  baseURL?: string;
  secret: string;
}

// Export all types from separate files
export * from './auth-session.js';
export * from './database-models.js';
export * from './user-payload.js';
