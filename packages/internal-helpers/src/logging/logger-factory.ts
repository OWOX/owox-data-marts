import type { Logger as LoggerInterface, LoggerProvider, LoggerConfig } from './types.js';
import { PinoLoggerProvider } from './providers/index.js';
import { Logger as LoggerClass } from './logger.js';

import { LogLevel, LogFormat } from './types.js';

export class LoggerFactory {
  private static readonly DEFAULT_FORMAT = LogFormat.PRETTY;
  private static readonly DEFAULT_NAME = 'default';
  private static readonly DEFAULT_LEVEL = LogLevel.INFO;

  private static defaultLogger: LoggerInterface | undefined;

  static getDefault(): LoggerInterface {
    if (!this.defaultLogger) {
      const resolvedConfig = this.resolveConfiguration();
      this.defaultLogger = new LoggerClass(
        this.resolveLoggerProvider(resolvedConfig),
        resolvedConfig.level
      );
    }
    return this.defaultLogger;
  }

  static createNamedLogger(name: string): LoggerInterface {
    const resolvedConfig = this.resolveConfiguration();
    return new LoggerClass(
      this.resolveLoggerProvider({ ...resolvedConfig, name }),
      resolvedConfig.level
    );
  }

  static createCustomLogger(config: LoggerConfig): LoggerInterface {
    return new LoggerClass(this.resolveLoggerProvider(config), config.level);
  }

  static logConfigInfo(): void {
    const resolvedConfig = this.resolveConfiguration();
    this.getDefault().info(
      `Logger configuration: format: ${resolvedConfig.format}, min-level: ${this.stringifyLogLevel(resolvedConfig.level)}`
    );
  }

  private static resolveLoggerProvider(config: LoggerConfig): LoggerProvider {
    return new PinoLoggerProvider(config);
  }

  /**
   * Resolve the final configuration by merging defaults, environment variables,
   * and explicit configuration
   */
  private static resolveConfiguration(config?: LoggerConfig): LoggerConfig {
    const defaults = { level: this.DEFAULT_LEVEL, format: this.DEFAULT_FORMAT };

    const envLevel = this.getLogLevelFromEnv();
    const envFormat = this.getLogFormatFromEnv();

    const effectiveLevel = envLevel !== null ? envLevel : defaults.level;
    const effectiveFormat = envFormat !== null ? envFormat : defaults.format;

    const level = config?.level !== undefined ? this.parseLogLevel(config.level) : effectiveLevel;
    const format =
      config?.format !== undefined ? this.parseLogFormat(config.format) : effectiveFormat;
    const name = config?.name || this.DEFAULT_NAME;

    return {
      level,
      format,
      name,
      options: config?.options as Record<string, unknown>,
    };
  }

  private static getLogLevelFromEnv(): number | null {
    const envLevel = process.env.LOG_LEVEL?.trim().toLowerCase();
    if (!envLevel) return null;

    return this.parseLogLevel(envLevel);
  }

  /**
   * Parse log level from string or enum value
   */
  private static parseLogLevel(level: number | string): number {
    if (typeof level === 'number') {
      return level;
    }

    const levelStr = String(level).toLowerCase();
    switch (levelStr) {
      case 'trace':
        return 10;
      case 'debug':
        return 20;
      case 'info':
        return 30;
      case 'warn':
      case 'warning':
        return 40;
      case 'error':
        return 50;
      default:
        return this.DEFAULT_LEVEL;
    }
  }

  private static stringifyLogLevel(level: number): string {
    switch (level) {
      case LogLevel.TRACE:
        return 'trace';
      case LogLevel.DEBUG:
        return 'debug';
      case LogLevel.INFO:
        return 'info';
      case LogLevel.WARN:
        return 'warn';
      case LogLevel.ERROR:
        return 'error';
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * Get log format from environment variable LOG_FORMAT
   */
  private static getLogFormatFromEnv(): LogFormat | null {
    const envFormat = process.env.LOG_FORMAT?.trim().toLowerCase();
    if (!envFormat) return null;

    return this.parseLogFormat(envFormat);
  }

  /**
   * Parse log format from string or enum value
   */
  private static parseLogFormat(format: string): LogFormat {
    const formatStr = format.toLowerCase();
    switch (formatStr) {
      case 'json':
        return LogFormat.JSON;
      case 'pretty':
        return LogFormat.PRETTY;
      case 'gcp-cloud-logging':
        return LogFormat.GCP_CLOUD_LOGGING;
      default:
        return this.DEFAULT_FORMAT;
    }
  }
}
