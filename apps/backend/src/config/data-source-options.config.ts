import { ConfigService } from '@nestjs/config';
import { parseMysqlSslEnv } from '@owox/internal-helpers';
import { DataSourceOptions, Logger, LoggerOptions, LogLevel } from 'typeorm';
import { createLogger } from '../common/logger/logger.service';
import { getSqliteDatabasePath } from './get-sqlite-database-path';
import { LoggerService } from '@nestjs/common';

export enum DbType {
  sqlite = 'sqlite',
  mysql = 'mysql',
}

/**
 * Custom DataSource logger that implements the Logger interface
 * and uses the logger service from @nestjs/common for logging
 */
class CustomDataSourceLogger implements Logger {
  constructor(
    private readonly logger: LoggerService,
    private readonly loggingOptions: LoggerOptions
  ) {
    this.logger = logger;
    this.loggingOptions = loggingOptions;
  }

  private checkLoggingOptions(level: LogLevel) {
    if (this.loggingOptions === false) return false;
    if (this.loggingOptions === 'all' || this.loggingOptions === true) return true;
    if (this.loggingOptions.includes(level)) return true;
    return false;
  }

  logQuery(query: string, parameters?: unknown[]) {
    if (this.checkLoggingOptions('query')) {
      const message = parameters?.length
        ? `${query} -- Parameters: ${JSON.stringify(parameters)}`
        : query;
      this.logger.log(message);
    }
  }
  logQueryError(error: string | Error, query: string, parameters?: unknown[]) {
    if (this.checkLoggingOptions('error')) {
      const errorMessage = `[QUERY ERROR] ${query}${parameters?.length ? ` -- Parameters: ${JSON.stringify(parameters)}` : ''}`;
      this.logger.error(errorMessage, String(error));
    }
  }
  logQuerySlow(time: number, query: string, parameters?: unknown[]) {
    if (this.checkLoggingOptions('warn')) {
      const message = `[SLOW QUERY] (${time}ms): ${query}${parameters?.length ? ` -- Parameters: ${JSON.stringify(parameters)}` : ''}`;
      this.logger.warn(message);
    }
  }
  logSchemaBuild(message: string) {
    if (this.checkLoggingOptions('schema')) {
      this.logger.log(message);
    }
  }
  logMigration(message: string) {
    if (this.checkLoggingOptions('migration')) {
      this.logger.log(message);
    }
  }
  log(level: LogLevel, message: unknown) {
    switch (level) {
      case 'log':
      case 'info':
        if (this.checkLoggingOptions('info')) {
          this.logger.log(message);
        }
        break;
      case 'warn':
        if (this.checkLoggingOptions('warn')) {
          this.logger.warn(message);
        }
        break;
      case 'error':
        if (this.checkLoggingOptions('error')) {
          this.logger.error(message);
        }
        break;
      case 'query':
        if (this.checkLoggingOptions('query')) {
          this.logger.log(message);
        }
        break;
      case 'schema':
        if (this.checkLoggingOptions('schema')) {
          this.logger.log(message);
        }
        break;
      case 'migration':
        if (this.checkLoggingOptions('migration')) {
          this.logger.log(message);
        }
        break;
    }
  }
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
    logger: new CustomDataSourceLogger(
      createLogger('TypeORM'),
      resolveLoggerOptions(config.get<string>('TYPEORM_LOGGING', 'error'))
    ),
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
