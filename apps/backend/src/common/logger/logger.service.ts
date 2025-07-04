import { ConsoleLogger } from '@nestjs/common';

/**
 * Logger configuration object
 */
interface LoggerConfig {
  json: boolean;
  colors: boolean;
}

/**
 * Creates logger configuration based on environment variables.
 *
 * Environment variable: LOG_FORMAT
 * - undefined/any value except 'pretty' → JSON format (default, production-ready)
 * - 'pretty' → Human-readable format with colors (development-friendly)
 *
 * This configuration is automatically applied to ensure consistent logging
 * across all application components and deployment environments.
 *
 * @returns Logger configuration object with JSON format and colors settings
 *
 * @example
 * ```typescript
 * // Production (default): structured JSON logs
 * // No LOG_FORMAT needed
 * const config = createLoggerConfig();
 * // Result: { json: true, colors: false }
 *
 * // Development: pretty formatted logs
 * // LOG_FORMAT=pretty
 * const config = createLoggerConfig();
 * // Result: { json: false, colors: true }
 * ```
 */
function createLoggerConfig(): LoggerConfig {
  const usePrettyFormat = process.env.LOG_FORMAT === 'pretty';
  return {
    json: !usePrettyFormat,
    colors: usePrettyFormat,
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
