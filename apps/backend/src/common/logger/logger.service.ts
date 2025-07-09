import { ConsoleLogger, LogLevel } from '@nestjs/common';

/**
 * Logger configuration object
 */
interface LoggerConfig {
  json: boolean;
  colors: boolean;
  logLevels: LogLevel[];
}

const VALID_LOG_LEVELS: LogLevel[] = ['log', 'error', 'warn', 'debug', 'verbose', 'fatal'];

const DEFAULT_LOG_LEVELS: LogLevel[] = ['log', 'warn', 'error'];

/**
 * Validates and parses log levels from environment variable string.
 *
 * @param envLevels - Comma-separated string of log levels from environment
 * @returns Array of valid LogLevel values
 *
 * @example
 * ```typescript
 * // Valid input
 * parseLogLevels('log,warn,error') // Returns: ['log', 'warn', 'error']
 * parseLogLevels('debug,verbose') // Returns: ['debug', 'verbose']
 *
 * // Invalid/malformed input - falls back to defaults
 * parseLogLevels('invalid,log') // Returns: ['log', 'warn', 'error']
 * parseLogLevels('') // Returns: ['log', 'warn', 'error']
 * ```
 */
function parseLogLevels(envLevels: string): LogLevel[] {
  if (!envLevels?.trim()) {
    return DEFAULT_LOG_LEVELS;
  }

  const levels = envLevels
    .split(',')
    .map(level => level.trim() as LogLevel)
    .filter(level => VALID_LOG_LEVELS.includes(level));

  if (levels.length === 0) {
    return DEFAULT_LOG_LEVELS;
  }

  return levels;
}

/**
 * Creates logger configuration based on environment variables.
 *
 * Environment variables:
 * - LOG_FORMAT: 'json' → JSON format (production-ready), undefined/other → Human-readable format (development)
 * - LOG_LEVELS: Comma-separated log levels (e.g., 'log,warn,error,debug'). Defaults to 'log,warn,error'
 *
 * Valid log levels: log, error, warn, debug, verbose, fatal
 *
 * This configuration is automatically applied to ensure consistent logging
 * across all application components and deployment environments.
 *
 * @returns Logger configuration object with format, colors, and log levels settings
 *
 * @example
 * ```typescript
 * // Development defaults: pretty format, basic levels
 * // No env vars needed
 * const config = createLoggerConfig();
 * // Result: { json: false, colors: true, logLevels: ['log', 'warn', 'error'] }
 *
 * // Production: JSON format, custom levels
 * // LOG_FORMAT=json
 * // LOG_LEVELS=log,warn,error,debug
 * const config = createLoggerConfig();
 * // Result: { json: true, colors: false, logLevels: ['log', 'warn', 'error', 'debug'] }
 *
 * // Development with debug enabled
 * // LOG_LEVELS=log,warn,error,debug,verbose
 * const config = createLoggerConfig();
 * // Result: { json: false, colors: true, logLevels: ['log', 'warn', 'error', 'debug', 'verbose'] }
 * ```
 */
function createLoggerConfig(): LoggerConfig {
  const useJsonFormat = process.env.LOG_FORMAT === 'json';
  const logLevels = parseLogLevels(process.env.LOG_LEVELS || '');

  return {
    json: useJsonFormat,
    colors: !useJsonFormat,
    logLevels,
  };
}

/**
 * Creates a configured logger instance that supports both JSON and pretty formatting.
 *
 * This logger is designed for multiple usage contexts:
 *
 * **1. Bootstrap Phase (before NestJS initialization):**
 * Used in contexts where DI container is not yet available:
 * - main.ts (before app creation)
 * - load-env.ts (environment loading)
 * - data-source.ts (database configuration at module level)
 * - migrations.config.ts (may be called outside NestJS context)
 *
 * **2. Global NestJS Logger (via app.useLogger()):**
 * When set as the global logger, all NestJS components automatically use this logger:
 * - Controllers, Services, Guards, Interceptors
 * - Built-in NestJS modules (TypeORM, etc.)
 * - Any component using `new Logger(context)` from '@nestjs/common'
 *
 * **3. Direct Instantiation:**
 * Can be used directly in any TypeScript/Node.js context that needs logging.
 *
 * @param context - Optional context name that appears in log entries to identify the source
 * @returns Configured ConsoleLogger instance with JSON/pretty format support
 *
 * @example
 * ```typescript
 * // Bootstrap usage (before NestJS app creation)
 * import { createLogger } from './common/logger/logger.service';
 * const logger = createLogger('Bootstrap');
 * logger.log('Starting application...');
 *
 * // Global NestJS logger setup
 * import { NestFactory } from '@nestjs/core';
 * const app = await NestFactory.create(AppModule);
 * app.useLogger(createLogger());
 *
 * // After app.useLogger(), all NestJS components use this logger:
 * import { Logger, Injectable } from '@nestjs/common';
 * @Injectable()
 * export class SomeService {
 *   private readonly logger = new Logger(SomeService.name);
 *   // This logger will use our custom format automatically
 * }
 *
 * // Direct usage in any context
 * const logger = createLogger('MyModule');
 * logger.log('Custom message');
 * ```
 *
 * @see {@link https://docs.nestjs.com/techniques/logger NestJS Logger Documentation}
 */
export function createLogger(context?: string): ConsoleLogger {
  return new ConsoleLogger(context || '', createLoggerConfig());
}
