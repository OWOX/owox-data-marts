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

/**
 * Custom database adapter (for advanced use cases)
 */
export interface CustomDatabaseConfig {
  type: 'custom';
  adapter: any;
}

export type DatabaseConfig = SqliteConfig | MySqlConfig | CustomDatabaseConfig;

/**
 * Magic Link plugin configuration for Better Auth
 */
export interface MagicLinkConfig {
  enabled: boolean;
  sendMagicLink: (
    data: {
      email: string;
      token: string;
      url: string;
    },
    request?: any
  ) => Promise<void>;
  expiresIn?: number; // in seconds, default 300 (5 minutes)
  disableSignUp?: boolean;
}

export interface BetterAuthConfig {
  database: DatabaseConfig;
  emailAndPassword?: {
    enabled: boolean;
    requireEmailVerification?: boolean;
    sendEmailVerification?: (email: string, url: string, token: string) => Promise<void>;
  };
  magicLink?: MagicLinkConfig;
  socialProviders?: {
    google?: {
      clientId: string;
      clientSecret: string;
    };
    github?: {
      clientId: string;
      clientSecret: string;
    };
  };
  session?: {
    maxAge?: number;
  };
  trustedOrigins?: string[];
  baseURL?: string;
  secret: string;
}
