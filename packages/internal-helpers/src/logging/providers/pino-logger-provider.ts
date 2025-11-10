import { createGcpLoggingPinoConfig } from '@google-cloud/pino-logging-gcp-config';
import pino, { DestinationStream, LoggerOptions, Logger as PinoLogger } from 'pino';
import type { LoggerConfig, LoggerProvider } from '../types.js';
import { LogFormat, LogLevel } from '../types.js';

/**
 * Pino logger provider implementation
 */
export class PinoLoggerProvider implements LoggerProvider {
  private static sharedPrettyTransport: DestinationStream | null = null;
  private static sharedPrettyVerboseTransport: DestinationStream | null = null;
  private readonly pinoLogger: PinoLogger;

  constructor(config: LoggerConfig) {
    const options = this.buildPinoOptions(config);
    const destination = PinoLoggerProvider.resolveDestination(config.format);
    this.pinoLogger = destination ? pino(options, destination) : pino(options);
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

    if (config.format === LogFormat.GCP_CLOUD_LOGGING) {
      return createGcpLoggingPinoConfig(
        {},
        {
          ...baseOptions,
        }
      );
    }

    return baseOptions;
  }

  private static resolveDestination(format: LogFormat): DestinationStream | undefined {
    if (format === LogFormat.PRETTY) {
      return this.getSharedPrettyTransport();
    }
    if (format === LogFormat.PRETTY_VERBOSE) {
      return this.getSharedPrettyVerboseTransport();
    }
    return undefined;
  }

  private static getSharedPrettyTransport(): DestinationStream {
    if (this.sharedPrettyTransport) return this.sharedPrettyTransport;
    this.sharedPrettyTransport = pino.transport({
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
    }) as unknown as DestinationStream;
    return this.sharedPrettyTransport;
  }

  private static getSharedPrettyVerboseTransport(): DestinationStream {
    if (this.sharedPrettyVerboseTransport) return this.sharedPrettyVerboseTransport;
    this.sharedPrettyVerboseTransport = pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        colorizeObjects: true,
        timestampKey: 'time',
        translateTime: 'yyyy-mm-dd HH:MM:ss.l',
        ignore: 'pid,hostname,context,params',
        singleLine: true,
        messageFormat: '{if context}<{context}>: {end}{msg}',
      },
    }) as unknown as DestinationStream;
    return this.sharedPrettyVerboseTransport;
  }
}
