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

export interface MicrosoftProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectURI?: string;
  tenantId?: string;
  authority?: string;
  prompt?: string;
}

export interface SocialProvidersConfig {
  google?: GoogleProviderConfig;
  microsoft?: MicrosoftProviderConfig;
}

export type UiAuthProviders = {
  google: boolean;
  microsoft: boolean;
  email: boolean;
};

export type DatabaseConfig = SqliteConfig | MySqlConfig;

export interface SendgridEmailConfig {
  apiKey: string;
  verifiedSenderEmail: string;
  verifiedSenderName?: string;
}

export type EmailConfig =
  | {
      provider: 'none';
    }
  | {
      provider: 'sendgrid';
      sendgrid: SendgridEmailConfig;
    };

export interface BetterAuthConfig {
  database: DatabaseConfig;
  socialProviders?: SocialProvidersConfig;
  baseURL: string;
  secret: string;
  session?: {
    maxAge?: number;
  };
  /**
   * TTL для magic-link токенів (секунди).
   */
  magicLinkTtl?: number;
  trustedOrigins?: string[];
}

export * from './auth-session.js';
export * from './database-models.js';
