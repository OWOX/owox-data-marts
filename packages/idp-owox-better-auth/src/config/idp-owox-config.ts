import { parseMysqlSslEnv } from '@owox/internal-helpers';
import envPaths from 'env-paths';
import { existsSync, mkdirSync } from 'fs';
import ms from 'ms';
import type { PoolOptions } from 'mysql2';
import { dirname, join } from 'path';
import { z } from 'zod';
import type { BetterAuthConfig, DatabaseConfig, SocialProvidersConfig } from '../types/index.js';

const zMsString = z
  .string()
  .refine((s: string) => ms(s as ms.StringValue) !== undefined, {
    message: 'Invalid duration string',
  })
  .transform(s => s as ms.StringValue);

function normalizeOrigin(value: string, label: string): string {
  try {
    return new URL(value).origin;
  } catch (error) {
    throw new Error(`Invalid ${label} value: ${value}. ${error instanceof Error ? error.message : error}`);
  }
}

function ensureValidUrl(value: string, label: string): string {
  try {
    new URL(value);
    return value;
  } catch {
    throw new Error(`Invalid ${label} value: ${value}`);
  }
}

function buildAllowedRedirectOrigins(
  raw: string | undefined,
  signInUrl: string,
  signUpUrl: string
): string[] {
  const defaults = [
    normalizeOrigin(signInUrl, 'IDP_OWOX_PLATFORM_SIGN_IN_URL'),
    normalizeOrigin(signUpUrl, 'IDP_OWOX_PLATFORM_SIGN_UP_URL'),
  ];
  const extra = raw
    ? raw
        .split(',')
        .map(x => x.trim())
        .filter(Boolean)
        .map(origin => normalizeOrigin(origin, 'IDP_OWOX_ALLOWED_REDIRECT_ORIGINS'))
    : [];

  return Array.from(new Set([...defaults, ...extra]));
}

/** ---------- DB env (SQLite or MySQL) ---------- */

function defaultSqlitePath(): string {
  const paths = envPaths('owox', { suffix: '' });
  const dbPath = join(paths.data, 'sqlite', 'idp-owox-better-auth.db');

  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    try {
      mkdirSync(dbDir, { recursive: true });
    } catch (error: unknown) {
      throw new Error(
        `Failed to create SQLite database directory: ${dbDir}. ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  }

  return dbPath;
}

const MysqlEnvSchemaRaw = z.object({
  IDP_OWOX_DB_TYPE: z.literal('mysql'),
  IDP_OWOX_MYSQL_HOST: z.string().min(1, 'IDP_OWOX_MYSQL_HOST is required'),
  IDP_OWOX_MYSQL_USER: z.string().min(1, 'IDP_OWOX_MYSQL_USER is required'),
  IDP_OWOX_MYSQL_PASSWORD: z.string().min(1, 'IDP_OWOX_MYSQL_PASSWORD is required'),
  IDP_OWOX_MYSQL_DB: z.string().min(1, 'IDP_OWOX_MYSQL_DB is required'),
  IDP_OWOX_MYSQL_PORT: z.string().optional(),
  IDP_OWOX_MYSQL_CONNECTION_LIMIT: z.string().optional(),
  IDP_OWOX_MYSQL_SSL: z.string().optional(),
});

const SqliteEnvSchemaRaw = z.object({
  IDP_OWOX_DB_TYPE: z.literal('sqlite'),
  IDP_OWOX_SQLITE_DB_PATH: z.string().optional(),
});

const DbEnvSchema = z
  .discriminatedUnion('IDP_OWOX_DB_TYPE', [MysqlEnvSchemaRaw, SqliteEnvSchemaRaw])
  .transform(env => {
    if (env.IDP_OWOX_DB_TYPE === 'mysql') {
      const port = env.IDP_OWOX_MYSQL_PORT ? Number(env.IDP_OWOX_MYSQL_PORT) : undefined;
      const connectionLimit = env.IDP_OWOX_MYSQL_CONNECTION_LIMIT
        ? Number(env.IDP_OWOX_MYSQL_CONNECTION_LIMIT)
        : undefined;
      const ssl = parseMysqlSslEnv(env.IDP_OWOX_MYSQL_SSL) as PoolOptions['ssl'];

      return {
        type: 'mysql' as const,
        host: env.IDP_OWOX_MYSQL_HOST,
        port,
        user: env.IDP_OWOX_MYSQL_USER,
        password: env.IDP_OWOX_MYSQL_PASSWORD,
        database: env.IDP_OWOX_MYSQL_DB,
        connectionLimit,
        ...(ssl === undefined ? {} : { ssl }),
      };
    }

    return {
      type: 'sqlite' as const,
      filename: env.IDP_OWOX_SQLITE_DB_PATH ?? defaultSqlitePath(),
    };
  });

export function loadDbConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const IDP_OWOX_DB_TYPE = (env.IDP_OWOX_DB_TYPE ?? 'sqlite').toLowerCase() as 'mysql' | 'sqlite';
  return DbEnvSchema.parse({ ...env, IDP_OWOX_DB_TYPE });
}

/** ---------- IdentityOwox client ---------- */

const IdentityOwoxClientEnvSchema = z
  .object({
    IDP_OWOX_BASE_URL: z.string().url({ message: 'IDP_OWOX_BASE_URL must be a valid URL' }),
    IDP_OWOX_DEFAULT_HEADERS: z.string().optional(),
    IDP_OWOX_TIMEOUT: zMsString.optional(),
    IDP_OWOX_BACKCHANNEL_API_PREFIX: z
      .string()
      .min(1, 'IDP_OWOX_BACKCHANNEL_API_PREFIX is required'),
    IDP_OWOX_C2C_SERVICE_ACCOUNT: z.string().min(1, 'IDP_OWOX_C2C_SERVICE_ACCOUNT is required'),
    IDP_OWOX_C2C_TARGET_AUDIENCE: z.string().min(1, 'IDP_OWOX_C2C_TARGET_AUDIENCE is required'),
  })
  .transform(e => {
    const defaultHeaders = e.IDP_OWOX_DEFAULT_HEADERS
      ? (JSON.parse(e.IDP_OWOX_DEFAULT_HEADERS) as Record<string, string>)
      : undefined;
    return {
      baseUrl: e.IDP_OWOX_BASE_URL,
      defaultHeaders,
      clientTimeout: (e.IDP_OWOX_TIMEOUT ?? '3s') as ms.StringValue,
      backchannelApiPrefix: e.IDP_OWOX_BACKCHANNEL_API_PREFIX,
      c2cServiceAccountEmail: e.IDP_OWOX_C2C_SERVICE_ACCOUNT,
      c2cTargetAudience: e.IDP_OWOX_C2C_TARGET_AUDIENCE,
    };
  });

/** ---------- IDP (frontend/app) config ---------- */

const IdpEnvSchema = z
  .object({
    IDP_OWOX_CLIENT_ID: z.string().min(1, 'IDP_OWOX_CLIENT_ID is required'),
    IDP_OWOX_PLATFORM_SIGN_IN_URL: z
      .string()
      .url({ message: 'IDP_OWOX_PLATFORM_SIGN_IN_URL must be a valid URL' }),
    IDP_OWOX_PLATFORM_SIGN_UP_URL: z
      .string()
      .url({ message: 'IDP_OWOX_PLATFORM_SIGN_UP_URL must be a valid URL' }),
    IDP_OWOX_ALLOWED_REDIRECT_ORIGINS: z.string().optional(),
  })
  .transform(e => ({
    clientId: e.IDP_OWOX_CLIENT_ID,
    platformSignInUrl: e.IDP_OWOX_PLATFORM_SIGN_IN_URL,
    platformSignUpUrl: e.IDP_OWOX_PLATFORM_SIGN_UP_URL,
    allowedRedirectOrigins: buildAllowedRedirectOrigins(
      e.IDP_OWOX_ALLOWED_REDIRECT_ORIGINS,
      e.IDP_OWOX_PLATFORM_SIGN_IN_URL,
      e.IDP_OWOX_PLATFORM_SIGN_UP_URL
    ),
  }));

/** ---------- JWT config ---------- */

const JwtEnvSchema = z
  .object({
    IDP_OWOX_JWT_CLOCK_TOLERANCE: zMsString.default('5s' as ms.StringValue),
    IDP_OWOX_JWT_ISSUER: z.string().min(1, 'IDP_OWOX_JWT_ISSUER is required'),
    IDP_OWOX_JWT_CACHE_TTL: zMsString.optional(),
    IDP_OWOX_JWT_ALGORITHM: z.enum(['RS256']).default('RS256'),
  })
  .transform(e => ({
    clockTolerance: e.IDP_OWOX_JWT_CLOCK_TOLERANCE,
    issuer: e.IDP_OWOX_JWT_ISSUER,
    jwtKeyCacheTtl: e.IDP_OWOX_JWT_CACHE_TTL ?? ('1h' as ms.StringValue),
    algorithm: e.IDP_OWOX_JWT_ALGORITHM,
  }));

export type DbConfig = z.infer<typeof DbEnvSchema>;
export type MysqlConfig = Extract<DbConfig, { type: 'mysql' }>;
export type SqliteConfig = Extract<DbConfig, { type: 'sqlite' }>;

export type IdpConfig = z.infer<typeof IdpEnvSchema>;
export type JwtConfig = z.infer<typeof JwtEnvSchema>;
export type IdentityOwoxClientConfig = z.infer<typeof IdentityOwoxClientEnvSchema>;

export type IdpOwoxConfig = {
  baseUrl: string;
  idpConfig: IdpConfig;
  identityOwoxClientConfig: IdentityOwoxClientConfig;
  jwtConfig: JwtConfig;
  dbConfig: DbConfig;
};

/** ---------- Better Auth (UI/auth) config ---------- */

const DEFAULT_SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const BetterAuthEnvSchema = z.object({
  IDP_BETTER_AUTH_SECRET: z.string().min(32, 'IDP_BETTER_AUTH_SECRET is required'),
  IDP_BETTER_AUTH_BASE_URL: z.string().url().optional(),
  IDP_BETTER_AUTH_SESSION_MAX_AGE: z.string().optional(),
  IDP_BETTER_AUTH_TRUSTED_ORIGINS: z.string().optional(),
  IDP_BETTER_AUTH_GOOGLE_CLIENT_ID: z.string().optional(),
  IDP_BETTER_AUTH_GOOGLE_CLIENT_SECRET: z.string().optional(),
  IDP_BETTER_AUTH_GOOGLE_PROMPT: z.string().optional(),
  IDP_BETTER_AUTH_GOOGLE_ACCESS_TYPE: z.string().optional(),
});

type Env = NodeJS.ProcessEnv;

function resolveBaseUrl(env: Env): string {
  const baseURL =
    env.IDP_BETTER_AUTH_BASE_URL ??
    env.PUBLIC_ORIGIN ??
    (env.PORT ? `http://localhost:${env.PORT}` : undefined) ??
    'http://localhost:3000';
  return ensureValidUrl(baseURL, 'IDP_BETTER_AUTH_BASE_URL');
}

function toNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseTrustedOrigins(raw: string | undefined, baseUrl: string | undefined): string[] {
  const origins = raw
    ? raw
        .split(',')
        .map(x => x.trim())
        .filter(Boolean)
        .map(origin => normalizeOrigin(origin, 'IDP_BETTER_AUTH_TRUSTED_ORIGINS'))
    : [];

  if (baseUrl) {
    origins.push(normalizeOrigin(baseUrl, 'IDP_BETTER_AUTH_BASE_URL'));
  }

  return Array.from(new Set(origins));
}

function buildSocialProviders(
  env: z.infer<typeof BetterAuthEnvSchema>,
  baseURL: string | undefined
): SocialProvidersConfig | undefined {
  const social: SocialProvidersConfig = {};

  if (env.IDP_BETTER_AUTH_GOOGLE_CLIENT_ID && env.IDP_BETTER_AUTH_GOOGLE_CLIENT_SECRET) {
    social.google = {
      clientId: env.IDP_BETTER_AUTH_GOOGLE_CLIENT_ID,
      clientSecret: env.IDP_BETTER_AUTH_GOOGLE_CLIENT_SECRET,
      redirectURI: baseURL
        ? `${baseURL.replace(/\/$/, '')}/auth/better-auth/callback/google`
        : undefined,
      prompt: env.IDP_BETTER_AUTH_GOOGLE_PROMPT ?? 'select_account',
      accessType: env.IDP_BETTER_AUTH_GOOGLE_ACCESS_TYPE ?? 'offline',
    };
  }

  return Object.keys(social).length ? social : undefined;
}

export type BetterAuthProviderConfig = {
  betterAuth: BetterAuthConfig;
  idpOwox: IdpOwoxConfig;
};

/**
 * Load the full IdpOwoxConfig from process env.
 * Throws on validation errors; ensures JWT_ALGORITHM is RS256.
 */
export function loadIdpOwoxConfigFromEnv(env: NodeJS.ProcessEnv = process.env): IdpOwoxConfig {
  const dbConfig = loadDbConfigFromEnv(env);
  const identityOwoxClientConfig = IdentityOwoxClientEnvSchema.parse(env);
  const idpConfig = IdpEnvSchema.parse(env);
  const jwtConfig = JwtEnvSchema.parse(env);
  const baseUrl = resolveBaseUrl(env);

  if (jwtConfig.algorithm !== 'RS256') {
    throw new Error(`Only RS256 is supported, got: ${jwtConfig.algorithm}`);
  }

  return {
    baseUrl,
    idpConfig,
    identityOwoxClientConfig,
    jwtConfig,
    dbConfig,
  };
}

/**
 * Loads Better Auth + IdP OWOX config from environment.
 */
export function loadBetterAuthProviderConfigFromEnv(
  env: Env = process.env
): BetterAuthProviderConfig {
  const idpOwox = loadIdpOwoxConfigFromEnv(env);
  const baEnv = BetterAuthEnvSchema.parse(env);

  const safeBaseURL = resolveBaseUrl(env);

  const betterAuthConfig: BetterAuthConfig = {
    database: idpOwox.dbConfig,
    secret: baEnv.IDP_BETTER_AUTH_SECRET,
    baseURL: safeBaseURL,
    session: { maxAge: toNumber(baEnv.IDP_BETTER_AUTH_SESSION_MAX_AGE, DEFAULT_SESSION_MAX_AGE) },
    trustedOrigins: parseTrustedOrigins(baEnv.IDP_BETTER_AUTH_TRUSTED_ORIGINS, safeBaseURL),
    socialProviders: buildSocialProviders(baEnv, safeBaseURL),
  };

  return { betterAuth: betterAuthConfig, idpOwox };
}
