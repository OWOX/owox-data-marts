import { ILogger, ILoggerProvider, LogLevel } from './types.js';

export class Logger implements ILogger {
  constructor(
    private readonly adapter: ILoggerProvider,
    private readonly level: LogLevel
  ) {}

  debug(messageOrMeta: string | Record<string, unknown>, message?: string): void {
    if (LogLevel.DEBUG >= this.level) {
      this.adapter.log(LogLevel.DEBUG, messageOrMeta, message);
    }
  }
  info(messageOrMeta: string | Record<string, unknown>, message?: string): void {
    if (LogLevel.INFO >= this.level) {
      this.adapter.log(LogLevel.INFO, messageOrMeta, message);
    }
  }
  warn(messageOrMeta: string | Record<string, unknown>, message?: string): void {
    if (LogLevel.WARN >= this.level) {
      this.adapter.log(LogLevel.WARN, messageOrMeta, message);
    }
  }
  error(messageOrMeta: string | Record<string, unknown>, message?: string): void {
    if (LogLevel.ERROR >= this.level) {
      this.adapter.log(LogLevel.ERROR, messageOrMeta, message);
    }
  }
  trace(messageOrMeta: string | Record<string, unknown>, message?: string): void {
    if (LogLevel.TRACE >= this.level) {
      this.adapter.log(LogLevel.TRACE, messageOrMeta, message);
    }
  }
  log(
    level: LogLevel,
    messageOrMeta: string | Record<string, unknown>,
    message?: string,
    force?: boolean
  ): void {
    if (level >= this.level || force) {
      this.adapter.log(level, messageOrMeta, message);
    }
  }
}
