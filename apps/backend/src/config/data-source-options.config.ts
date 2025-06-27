import { ConfigService } from '@nestjs/config';
import { DataSourceOptions, LoggerOptions } from 'typeorm';
import { Logger } from '@nestjs/common';
import envPaths from 'env-paths';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

const logger = new Logger('DataSourceOptions');

export enum DbType {
  sqlite = 'sqlite',
  mysql = 'mysql',
}

/**
 * Determines the SQLite database file path based on configuration.
 *
 * If `SQLITE_DB_PATH` environment variable is set, uses that path directly.
 * Otherwise, uses cross-platform application data directory with 'owox/sqlite/app.db' structure.
 * Automatically creates the database directory if it doesn't exist.
 *
 * @param config - NestJS ConfigService instance for accessing environment variables
 * @returns The absolute path to the SQLite database file
 * @throws {Error} When database directory cannot be created due to permissions or other filesystem errors
 *
 * @example
 * ```typescript
 * // With SQLITE_DB_PATH env variable
 * SQLITE_DB_PATH=./var/sqlite/app.db
 * // Returns: /project/root/var/sqlite/app.db
 *
 * // Without env variable (macOS example)
 * // Returns: ~/Library/Application Support/owox/sqlite/app.db
 * ```
 */
function getSqliteDatabasePath(config: ConfigService): string {
  const envDbPath = config.get<string>('SQLITE_DB_PATH');

  let dbPath: string;

  if (envDbPath) {
    logger.log(`Using SQLite database path from \`SQLITE_DB_PATH\` env: ${envDbPath}`);
    dbPath = envDbPath;
  } else {
    const paths = envPaths('owox', { suffix: '' });
    logger.log(`Using system app data directory for SQLite: ${paths.data}`);
    dbPath = join(paths.data, 'sqlite', 'app.db');
  }

  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    try {
      mkdirSync(dbDir, { recursive: true });
      logger.log(`Created SQLite database directory: ${dbDir}`);
    } catch (error) {
      throw new Error(`Failed to create SQLite database directory: ${dbDir}. ${error.message}`);
    }
  }

  logger.log(`Using SQLite database path: ${dbPath}`);
  return dbPath;
}

export function createDataSourceOptions(config: ConfigService): DataSourceOptions {
  const dbType = config.get<DbType>('DB_TYPE') ?? DbType.sqlite;
  logger.log(
    `Using DB_TYPE: ${config.get('DB_TYPE') ? `${dbType} (from env)` : `${dbType} (default)`}`
  );

  const baseOptions = {
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../migrations/[0-9]*-*.{ts,js}'],
    logging: resolveLoggerOptions(config.get<string>('TYPEORM_LOGGING', 'error')),
    // TODO Disable synchronize when enabling migrations mechanism
    synchronize: true,
  };

  const dbConfigs: Record<DbType, DataSourceOptions> = {
    [DbType.sqlite]: {
      type: DbType.sqlite,
      database: getSqliteDatabasePath(config),
      ...baseOptions,
    },
    [DbType.mysql]: {
      type: DbType.mysql,
      host: config.get<string>('DB_HOST'),
      port: Number(config.get<string>('DB_PORT')),
      username: config.get<string>('DB_USERNAME'),
      password: config.get<string>('DB_PASSWORD'),
      database: config.get<string>('DB_DATABASE'),
      ...baseOptions,
    },
  };

  return dbConfigs[dbType];
}

function resolveLoggerOptions(value: string): LoggerOptions {
  if (value === 'false') return false;
  if (value === 'true') return true;
  if (value === 'all') return 'all';

  return value.split(',').map(level => level.trim()) as LoggerOptions;
}
