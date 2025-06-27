import { ConfigService } from '@nestjs/config';
import { DataSourceOptions, LoggerOptions } from 'typeorm';
import { Logger } from '@nestjs/common';
import { getSqliteDatabasePath } from './get-sqlite-database-path';

const logger = new Logger('DataSourceOptions');

export enum DbType {
  sqlite = 'sqlite',
  mysql = 'mysql',
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
