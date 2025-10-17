import pino, { Logger as PinoLogger, LoggerOptions } from 'pino';
import { createGcpLoggingPinoConfig } from '@google-cloud/pino-logging-gcp-config';
import { LogFormat, LogLevel } from '../types.js';
import type { LoggerProvider, LoggerConfig } from '../types.js';

/**
 * Pino logger provider implementation
 */
export class PinoLoggerProvider implements LoggerProvider {
  private readonly pinoLogger: PinoLogger;

  constructor(config: LoggerConfig) {
    this.pinoLogger = pino(this.buildPinoOptions(config));
  }

  shutdown(): Promise<void> {
    return Promise.resolve(this.pinoLogger.flush());
  }

  log(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>,
    exception?: Error | unknown
  ): void {
    const logData = exception ? { ...meta, err: exception } : meta;

    switch (level) {
      case LogLevel.DEBUG:
        this.pinoLogger.debug(logData, message);
        break;
      case LogLevel.INFO:
        this.pinoLogger.info(logData, message);
        break;
      case LogLevel.WARN:
        this.pinoLogger.warn(logData, message);
        break;
      case LogLevel.ERROR:
        this.pinoLogger.error(logData, message);
        break;
      case LogLevel.TRACE:
        this.pinoLogger.trace(logData, message);
        break;
    }
  }

  /**
   * Build Pino options object from resolved configuration
   */
  private buildPinoOptions(config: LoggerConfig): LoggerOptions {
    const baseOptions: LoggerOptions = {
      name: config.name,
      level: 'trace',
      ...config.options,
    };

    if (config.format === LogFormat.PRETTY) {
      baseOptions.transport = {
        target: 'pino-pretty',
        options: {
          colorize: true,
          colorizeObjects: true,
          timestampKey: 'time',
          translateTime: 'yyyy-mm-dd HH:MM:ss.l',
          ignore: 'pid,hostname,context,params,metadata',
          singleLine: true,
          messageFormat: '{if context}<{context}>: {end}{msg}',
        },
      };
    } else if (config.format === LogFormat.GCP_CLOUD_LOGGING) {
      return createGcpLoggingPinoConfig(
        {},
        {
          ...baseOptions,
        }
      );
    }

    return baseOptions;
  }
}
