import { Logger } from '@nestjs/common';
import { ExecutionContext } from './execution-context';

/**
 * Logger that automatically includes execution context in all log messages
 * Provides consistent contextual information across connector execution
 */
export class ContextualLogger {
  constructor(
    private readonly logger: Logger,
    private readonly context: ExecutionContext
  ) {}

  /**
   * Log informational message with context
   */
  log(message: string, additionalContext?: Record<string, unknown>): void {
    this.logger.log(message, this.mergeContext(additionalContext));
  }

  /**
   * Log error message with context
   */
  error(message: string, trace?: string, additionalContext?: Record<string, unknown>): void {
    this.logger.error(message, trace, this.mergeContext(additionalContext));
  }

  /**
   * Log warning message with context
   */
  warn(message: string, additionalContext?: Record<string, unknown>): void {
    this.logger.warn(message, this.mergeContext(additionalContext));
  }

  /**
   * Log debug message with context
   */
  debug(message: string, additionalContext?: Record<string, unknown>): void {
    this.logger.debug(message, this.mergeContext(additionalContext));
  }

  /**
   * Log verbose message with context
   */
  verbose(message: string, additionalContext?: Record<string, unknown>): void {
    this.logger.verbose(message, this.mergeContext(additionalContext));
  }

  /**
   * Merge execution context with additional context
   */
  private mergeContext(additionalContext?: Record<string, unknown>): Record<string, unknown> {
    if (!additionalContext) {
      return this.context.toLogContext();
    }
    return this.context.withFields(additionalContext);
  }

  /**
   * Get the underlying execution context
   */
  getContext(): ExecutionContext {
    return this.context;
  }
}
