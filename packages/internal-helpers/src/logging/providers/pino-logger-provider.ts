import pino, { Logger as PinoLogger, LoggerOptions } from 'pino';
import { createGcpLoggingPinoConfig } from '@google-cloud/pino-logging-gcp-config';
import { LogFormat, LogLevel } from '../types.js';
import type { ILoggerProvider, LoggerConfig } from '../types.js';

/**
 * Pino logger provider implementation
 */
export class PinoLoggerProvider implements ILoggerProvider {
  private readonly pinoLogger: PinoLogger;

  constructor(config: LoggerConfig) {
    this.pinoLogger = pino(this.buildPinoOptions(config));
  }

  shutdown(): Promise<void> {
    return Promise.resolve(this.pinoLogger.flush());
  }

  log(level: LogLevel, messageOrMeta: string | Record<string, unknown>, message?: string): void {
    switch (level) {
      case LogLevel.DEBUG:
        this.pinoLogger.debug(messageOrMeta, message);
        break;
      case LogLevel.INFO:
        this.pinoLogger.info(messageOrMeta, message);
        break;
      case LogLevel.WARN:
        this.pinoLogger.warn(messageOrMeta, message);
        break;
      case LogLevel.ERROR:
        this.pinoLogger.error(messageOrMeta, message);
        break;
      case LogLevel.TRACE:
        this.pinoLogger.trace(messageOrMeta, message);
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
          ignore: 'pid,hostname,context,params',
          singleLine: true,
          messageFormat: '{if context}<{context}>: {end}{msg}{if params} {params}{end}',
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

  /**
   * Convert numeric level to Pino level string
   */
  private logLevelToPinoLevel(level: number): string {
    switch (level) {
      case 10:
        return 'trace';
      case 20:
        return 'debug';
      case 30:
        return 'info';
      case 40:
        return 'warn';
      case 50:
        return 'error';
      default:
        return 'info';
    }
  }
}
