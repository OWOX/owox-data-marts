import { LoggerService } from '@nestjs/common';
import { LoggerFactory, type Logger } from '@owox/internal-helpers';
import * as process from 'node:process';
import { ClsService, ClsServiceManager } from 'nestjs-cls';
import { AUTH_CONTEXT } from '../../idp/guards/idp.guard';

/**
 * Custom NestJS logger service that implements the LoggerService interface
 * and uses logger factory from @owox/internal-helpers for consistent logging
 * across all OWOX packages.
 */
export class CustomLoggerService implements LoggerService {
  private logger: Logger;
  private context: string;
  private cls: ClsService;

  constructor(context?: string) {
    this.context = context || 'NestJS';
    this.logger = LoggerFactory.createNamedLogger(this.context);
    this.cls = ClsServiceManager.getClsService();
  }

  /**
   * Create a new logger with a child context
   * @param context - The child context
   * @returns A new logger with the child context
   */
  child(context?: string): CustomLoggerService {
    return new CustomLoggerService(this.context + '::' + context);
  }

  /**
   * Write a 'log' level log.
   */
  log(message: unknown, context?: string): void;
  log(message: unknown, ...optionalParams: unknown[]): void;
  log(message: unknown, ...optionalParams: unknown[]): void {
    const [context, ...params] = optionalParams;
    this.logger.info(String(message), this.destructureParams(undefined, context, params));
  }

  /**
   * Write an 'error' level log.
   */
  error(message: unknown, trace?: string, context?: string): void;
  error(message: unknown, ...optionalParams: unknown[]): void;
  error(message: unknown, ...optionalParams: unknown[]): void {
    const [trace, context, ...params] = optionalParams;
    this.logger.error(String(message), this.destructureParams(trace, context, params), trace);
  }

  /**
   * Write a 'warn' level log.
   */
  warn(message: unknown, context?: string): void;
  warn(message: unknown, ...optionalParams: unknown[]): void;
  warn(message: unknown, ...optionalParams: unknown[]): void {
    const [context, ...params] = optionalParams;
    this.logger.warn(String(message), this.destructureParams(undefined, context, params));
  }

  /**
   * Write a 'debug' level log.
   */
  debug(message: unknown, context?: string): void;
  debug(message: unknown, ...optionalParams: unknown[]): void;
  debug(message: unknown, ...optionalParams: unknown[]): void {
    const [context, ...params] = optionalParams;
    this.logger.debug(String(message), this.destructureParams(undefined, context, params));
  }

  /**
   * Write a 'verbose' level log.
   */
  verbose(message: unknown, context?: string): void;
  verbose(message: unknown, ...optionalParams: unknown[]): void;
  verbose(message: unknown, ...optionalParams: unknown[]): void {
    const [context, ...params] = optionalParams;
    this.logger.trace(String(message), this.destructureParams(undefined, context, params));
  }

  /**
   * Set log levels
   * @param levels - levels to be set
   */
  setLogLevels?(_levels: string[]): void {
    // This is called by NestJS but we handle log levels through environment variables
    // in our LoggerFactory, so we don't need to implement this
  }

  /**
   * Destructure the optional parameters
   * @param optionalParams - The optional parameters
   * @returns The destructured parameters
   */
  private destructureParams(
    trace?: unknown,
    context?: unknown,
    params?: unknown[]
  ): { context: string; trace: unknown; params: unknown[]; metadata: Record<string, unknown> } {
    const output: {
      context: string;
      trace: unknown;
      params: unknown[];
      metadata: Record<string, unknown>;
    } = {
      context: this.context ?? '',
      trace: undefined,
      params: [],
      metadata: {},
    };
    if (trace) {
      switch (typeof trace) {
        case 'string':
          output.trace = trace;
          break;
        case 'object':
          output.metadata = { ...output.metadata, ...trace };
          break;
        default:
          output.params.push(trace);
          break;
      }
    }
    if (context) {
      switch (typeof context) {
        case 'string':
          output.context = context;
          break;
        case 'object':
          output.metadata = { ...output.metadata, ...context };
          break;
        default:
          output.params.push(context);
          break;
      }
    }
    if (params && params.length > 0) {
      for (const param of params) {
        if (typeof param === 'object' && param !== null) {
          output.metadata = { ...output.metadata, ...param };
        } else if (typeof param === 'string') {
          output.context = param;
        }
        output.params.push(param);
      }
    }
    output.metadata.version = process.env.APP_OWOX_VERSION || 'unknown';
    const authContext = this.cls.get<Record<string, unknown>>(AUTH_CONTEXT);
    if (authContext) {
      output.metadata.authContext = authContext;
    }

    return output;
  }
}

/**
 * Creates a configured logger instance that uses Pino logger from @owox/internal-helpers
 * for consistent logging across all OWOX packages.
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
 * @returns Configured CustomLoggerService instance from @owox/internal-helpers
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
export function createLogger(context?: string): CustomLoggerService {
  return new CustomLoggerService(context);
}
