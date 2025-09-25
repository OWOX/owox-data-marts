import { Logger as LoggerInterface, LoggerProvider, LogLevel } from './types.js';

export class Logger implements LoggerInterface {
  constructor(
    private readonly adapter: LoggerProvider,
    private readonly level: LogLevel
  ) {}

  debug(message: string, meta?: Record<string, unknown>): void {
    if (LogLevel.DEBUG >= this.level) {
      this.adapter.log(LogLevel.DEBUG, message, meta);
    }
  }
  info(message: string, meta?: Record<string, unknown>): void {
    if (LogLevel.INFO >= this.level) {
      this.adapter.log(LogLevel.INFO, message, meta);
    }
  }
  warn(message: string, meta?: Record<string, unknown>, exception?: Error): void {
    if (LogLevel.WARN >= this.level) {
      this.adapter.log(LogLevel.WARN, message, meta, exception);
    }
  }
  error(message: string, meta?: Record<string, unknown>, exception?: Error): void {
    if (LogLevel.ERROR >= this.level) {
      this.adapter.log(LogLevel.ERROR, message, meta, exception);
    }
  }
  trace(message: string, meta?: Record<string, unknown>): void {
    if (LogLevel.TRACE >= this.level) {
      this.adapter.log(LogLevel.TRACE, message, meta);
    }
  }
  log(level: LogLevel, message: string, meta?: Record<string, unknown>, exception?: Error): void {
    if (level >= this.level) {
      this.adapter.log(level, message, meta, exception);
    }
  }
}
