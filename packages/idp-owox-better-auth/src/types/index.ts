import type { PoolOptions } from 'mysql2';
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
  port: number | undefined;
  ssl?: PoolOptions['ssl'];
  connectionLimit: number | undefined;
}

export interface GoogleProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectURI?: string;
  prompt?: string;
  accessType?: string;
}

export interface SocialProvidersConfig {
  google?: GoogleProviderConfig;
}

export type DatabaseConfig = SqliteConfig | MySqlConfig;

export interface BetterAuthConfig {
  database: DatabaseConfig;
  socialProviders?: SocialProvidersConfig;
  session?: {
    maxAge?: number;
  };
  trustedOrigins?: string[];
  baseURL?: string;
  secret: string;
}

export * from './auth-session.js';
export * from './database-models.js';
