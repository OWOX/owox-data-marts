import { LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseMysqlSslEnv } from '@owox/internal-helpers';
import { DataSourceOptions } from 'typeorm';
import { createLogger } from '../common/logger/logger.service';
import {
  DbType,
  RedactingDataSourceLogger,
  resolveLoggerOptions,
} from './data-source-options.config';
import { getSqliteDatabasePath } from './get-sqlite-database-path';

export const PLUGIN_COLLECTIONS_DATA_SOURCE = 'pluginCollections';

function optionalString(config: ConfigService, key: string): string | undefined {
  const value = config.get<string>(key);
  return value && value.trim().length > 0 ? value : undefined;
}

function collectionValue(
  config: ConfigService,
  key: string,
  fallbackKey: string
): string | undefined {
  return optionalString(config, key) ?? optionalString(config, fallbackKey);
}

/**
 * Cloud can point this connection at its isolated MySQL instance. Local and self-hosted
 * deployments need no extra configuration: each option falls back to the main DB.
 */
export function createPluginCollectionsDataSourceOptions(config: ConfigService): DataSourceOptions {
  const dbType = (collectionValue(config, 'PLUGIN_COLLECTIONS_DB_TYPE', 'DB_TYPE')?.trim() ??
    DbType.sqlite) as DbType;
  const baseOptions = {
    entities: [__dirname + '/../plugin-host/collections/**/*.collection.entity{.ts,.js}'],
    migrations: [__dirname + '/../plugin-host/collections/migrations/[0-9]*-*.{ts,js}'],
    migrationsTableName: 'plugin_collections_migrations',
    logger: new RedactingDataSourceLogger(
      createLogger('PluginCollectionsTypeORM') as LoggerService,
      resolveLoggerOptions(config.get<string>('TYPEORM_LOGGING', 'error'))
    ),
    synchronize: false,
  };

  if (dbType === DbType.sqlite) {
    const configuredPath = optionalString(config, 'PLUGIN_COLLECTIONS_SQLITE_DB_PATH');
    return {
      type: 'better-sqlite3',
      database: configuredPath ?? getSqliteDatabasePath(config),
      ...baseOptions,
    };
  }

  if (dbType === DbType.mysql) {
    const ssl = parseMysqlSslEnv(
      collectionValue(config, 'PLUGIN_COLLECTIONS_DB_MYSQL_SSL', 'DB_MYSQL_SSL')
    );
    return {
      type: DbType.mysql,
      host: collectionValue(config, 'PLUGIN_COLLECTIONS_DB_HOST', 'DB_HOST'),
      port: Number(collectionValue(config, 'PLUGIN_COLLECTIONS_DB_PORT', 'DB_PORT')),
      username: collectionValue(config, 'PLUGIN_COLLECTIONS_DB_USERNAME', 'DB_USERNAME'),
      password: collectionValue(config, 'PLUGIN_COLLECTIONS_DB_PASSWORD', 'DB_PASSWORD'),
      database: collectionValue(config, 'PLUGIN_COLLECTIONS_DB_DATABASE', 'DB_DATABASE'),
      ...(ssl === undefined ? {} : { ssl }),
      ...baseOptions,
    };
  }

  throw new Error(`Unsupported PLUGIN_COLLECTIONS_DB_TYPE: ${dbType}`);
}
