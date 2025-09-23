import { ConfigService } from '@nestjs/config';
import { parseMysqlSslEnv } from '@owox/internal-helpers';
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

  if (dbType === DbType.sqlite) {
    return {
      type: DbType.sqlite,
      database: getSqliteDatabasePath(config),
      ...baseOptions,
    } as DataSourceOptions;
  } else if (dbType === DbType.mysql) {
    const ssl = parseMysqlSslEnv(config.get<string>('DB_MYSQL_SSL'));

    return {
      type: DbType.mysql,
      host: config.get<string>('DB_HOST'),
      port: Number(config.get<string>('DB_PORT')),
      username: config.get<string>('DB_USERNAME'),
      password: config.get<string>('DB_PASSWORD'),
      database: config.get<string>('DB_DATABASE'),
      ...(ssl === undefined ? {} : { ssl }),
      ...baseOptions,
    } as DataSourceOptions;
  } else {
    throw new Error(`Unsupported DB_TYPE: ${dbType}`);
  }
}

function resolveLoggerOptions(value: string): LoggerOptions {
  if (value === 'false') return false;
  if (value === 'true') return true;
  if (value === 'all') return 'all';

  return value.split(',').map(level => level.trim()) as LoggerOptions;
}
