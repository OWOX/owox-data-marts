/**
 * Log level enum with numeric values for threshold comparison
 */
export enum LogLevel {
  TRACE = 10,
  DEBUG = 20,
  INFO = 30,
  WARN = 40,
  ERROR = 50,
}

/**
 * Log format types
 */
export enum LogFormat {
  PRETTY = 'pretty',
  JSON = 'json',
  GCP_CLOUD_LOGGING = 'gcp-cloud-logging',
}

/**
 * Configuration interface for logger creation
 */
export interface LoggerConfig {
  /** Log level threshold - only logs at this level or higher will be output */
  level: LogLevel;
  /** Log format - pretty for human-readable, json for structured logs */
  format: LogFormat;
  /** Custom logger name/context */
  name?: string;
  /** Additional provider-specific options */
  options?: Record<string, unknown>;
}

/**
 * Universal logger interface that all logger implementations must follow
 */
export interface ILogger {
  debug(messageOrMeta: string | Record<string, unknown>, message?: string): void;
  info(messageOrMeta: string | Record<string, unknown>, message?: string): void;
  warn(messageOrMeta: string | Record<string, unknown>, message?: string): void;
  error(messageOrMeta: string | Record<string, unknown>, message?: string): void;
  trace(messageOrMeta: string | Record<string, unknown>, message?: string): void;
  log(
    level: LogLevel,
    messageOrMeta: string | Record<string, unknown>,
    message?: string,
    force?: boolean
  ): void;
}

/**
 * Logger provider interface that creates actual logger instances
 */
export interface ILoggerProvider {
  shutdown?(): Promise<void>;
  log(level: LogLevel, messageOrMeta: string | Record<string, unknown>, message?: string): void;
}
