import { z } from 'zod';
import type { PoolOptions } from 'mysql2/promise';
import ms from 'ms';
import envPaths from 'env-paths';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { parseMysqlSslEnv } from '@owox/internal-helpers';

const zMsString = z
  .string()
  .refine((s: string) => ms(s as ms.StringValue) !== undefined, {
    message: 'Invalid duration string',
  })
  .transform(s => s as ms.StringValue);

const parseCommaString = z.string().transform(s =>
  s
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)
);

function getSqliteDefaultDbPath(): string {
  const paths = envPaths('owox', { suffix: '' });
  const dbPath = join(paths.data, 'sqlite', 'idp-owox.db');

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

/** ---------- DB env (discriminated by IDP_OWOX_DB_TYPE) ---------- */

const SqliteEnvRaw = z.object({
  IDP_OWOX_DB_TYPE: z.literal('sqlite'),
  IDP_OWOX_SQLITE_DB_PATH: z.string().optional(),
  IDP_OWOX_SQLITE_PRAGMA: z.string().optional(),
});

const MysqlEnvRaw = z.object({
  IDP_OWOX_DB_TYPE: z.literal('mysql'),
  IDP_OWOX_MYSQL_HOST: z.string().min(1, 'IDP_OWOX_MYSQL_HOST is required'),
  IDP_OWOX_MYSQL_USER: z.string().min(1, 'IDP_OWOX_MYSQL_USER is required'),
  IDP_OWOX_MYSQL_PASSWORD: z.string().min(1, 'IDP_OWOX_MYSQL_PASSWORD is required'),
  IDP_OWOX_MYSQL_DB: z.string().min(1, 'IDP_OWOX_MYSQL_DB is required'),
  IDP_OWOX_MYSQL_PORT: z.string().optional(),
  IDP_OWOX_MYSQL_CONNECTION_LIMIT: z.string().optional(),
  IDP_OWOX_MYSQL_SSL: z.string().optional(),
});

const DbEnvRaw = z.discriminatedUnion('IDP_OWOX_DB_TYPE', [SqliteEnvRaw, MysqlEnvRaw]);

export const DbEnvSchema = DbEnvRaw.transform(e => {
  if (e.IDP_OWOX_DB_TYPE === 'sqlite') {
    const dbPath = e.IDP_OWOX_SQLITE_DB_PATH ?? getSqliteDefaultDbPath();
    console.log(`idp-owox SQLite database path: ${dbPath}`);

    return {
      type: 'sqlite' as const,
      sqlite: {
        type: 'sqlite' as const,
        dbPath,
        pragma: e.IDP_OWOX_SQLITE_PRAGMA
          ? parseCommaString.parse(e.IDP_OWOX_SQLITE_PRAGMA)
          : undefined,
      },
    };
  }

  // mysql branch
  const port = e.IDP_OWOX_MYSQL_PORT ? Number(e.IDP_OWOX_MYSQL_PORT) : undefined;
  const connectionLimit = e.IDP_OWOX_MYSQL_CONNECTION_LIMIT
    ? Number(e.IDP_OWOX_MYSQL_CONNECTION_LIMIT)
    : undefined;
  const ssl = parseMysqlSslEnv(e.IDP_OWOX_MYSQL_SSL) as PoolOptions['ssl'];

  return {
    type: 'mysql' as const,
    mysql: {
      type: 'mysql' as const,
      host: e.IDP_OWOX_MYSQL_HOST,
      port,
      user: e.IDP_OWOX_MYSQL_USER,
      password: e.IDP_OWOX_MYSQL_PASSWORD,
      database: e.IDP_OWOX_MYSQL_DB,
      connectionLimit,
      ...(ssl === undefined ? {} : { ssl }),
    },
  };
});

export function loadDbConfigFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const IDP_OWOX_DB_TYPE = (env.IDP_OWOX_DB_TYPE ?? 'sqlite').toLowerCase() as 'sqlite' | 'mysql';
  return DbEnvSchema.parse({ ...env, IDP_OWOX_DB_TYPE });
}

/** ---------- IdentityOwox client ---------- */

const IdentityOwoxClientEnvSchema = z
  .object({
    IDP_OWOX_BASE_URL: z.string().url({ message: 'IDP_OWOX_BASE_URL must be a valid URL' }),
    IDP_OWOX_DEFAULT_HEADERS: z.string().optional(),
    IDP_OWOX_TIMEOUT: zMsString.optional(),
  })
  .transform(e => {
    const defaultHeaders = e.IDP_OWOX_DEFAULT_HEADERS
      ? (JSON.parse(e.IDP_OWOX_DEFAULT_HEADERS) as Record<string, string>)
      : undefined;
    return {
      baseUrl: e.IDP_OWOX_BASE_URL,
      defaultHeaders,
      clientTimeout: (e.IDP_OWOX_TIMEOUT ?? '3s') as ms.StringValue,
    };
  });

/** ---------- IDP (frontend/app) config ---------- */

const IdpEnvSchema = z
  .object({
    IDP_OWOX_CLIENT_ID: z.string().min(1, 'IDP_OWOX_CLIENT_ID is required'),
    IDP_OWOX_PLATFORM_SIGN_IN_URL: z
      .string()
      .url({ message: 'IDP_OWOX_PLATFORM_SIGN_IN_URL must be a valid URL' }),
    IDP_OWOX_CALLBACK_URL: z.string().min(1, 'IDP_OWOX_CALLBACK_URL is required'),
  })
  .transform(e => ({
    clientId: e.IDP_OWOX_CLIENT_ID,
    platformSignInUrl: e.IDP_OWOX_PLATFORM_SIGN_IN_URL,
    callbackUrl: e.IDP_OWOX_CALLBACK_URL,
  }));

/** ---------- JWT config ---------- */

const JwtEnvSchema = z
  .object({
    IDP_OWOX_JWT_CLOCK_TOLERANCE: z.string().default('5s'),
    IDP_OWOX_JWT_ISSUER: z.string().min(1, 'IDP_OWOX_JWT_ISSUER is required'),
    IDP_OWOX_JWT_CACHE_TTL: zMsString.optional(),
    IDP_OWOX_JWT_ALGORITHM: z.enum(['RS256']).default('RS256'),
  })
  .transform(e => ({
    clockTolerance: e.IDP_OWOX_JWT_CLOCK_TOLERANCE || '5s',
    issuer: e.IDP_OWOX_JWT_ISSUER,
    jwtKeyCacheTtl: e.IDP_OWOX_JWT_CACHE_TTL ?? '1h',
    algorithm: e.IDP_OWOX_JWT_ALGORITHM,
  }));

export type DbConfig = z.infer<typeof DbEnvSchema>;
export type SqliteConfig = Extract<DbConfig, { type: 'sqlite' }>['sqlite'];
export type MysqlConfig = Extract<DbConfig, { type: 'mysql' }>['mysql'];

export type IdentityOwoxClientConfig = z.infer<typeof IdentityOwoxClientEnvSchema>;
export type IdpConfig = z.infer<typeof IdpEnvSchema>;
export type JwtConfig = z.infer<typeof JwtEnvSchema>;

export type IdpOwoxConfig = {
  idpConfig: IdpConfig;
  identityOwoxClientConfig: IdentityOwoxClientConfig;
  jwtConfig: JwtConfig;
  dbConfig: DbConfig;
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

  if (jwtConfig.algorithm !== 'RS256') {
    throw new Error(`Only RS256 is supported, got: ${jwtConfig.algorithm}`);
  }

  return {
    idpConfig,
    identityOwoxClientConfig,
    jwtConfig,
    dbConfig,
  };
}
