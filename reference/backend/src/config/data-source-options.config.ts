import { ConfigService } from '@nestjs/config';
import { DataSourceOptions, LoggerOptions } from 'typeorm';
import { createLogger } from '../common/logger/logger.service';
import { getSqliteDatabasePath } from './get-sqlite-database-path';

export enum DbType {
  sqlite = 'sqlite',
  mysql = 'mysql',
}

export function createDataSourceOptions(config: ConfigService): DataSourceOptions {
  const logger = createLogger('DataSourceOptions');

  const dbType = config.get<DbType>('DB_TYPE') ?? DbType.sqlite;
  logger.log(
    `Using DB_TYPE: ${config.get('DB_TYPE') ? `${dbType} (from env)` : `${dbType} (default)`}`
  );

  const baseOptions = {
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../migrations/[0-9]*-*.{ts,js}'],
    logging: resolveLoggerOptions(config.get<string>('TYPEORM_LOGGING', 'error')),
    synchronize: false,
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
