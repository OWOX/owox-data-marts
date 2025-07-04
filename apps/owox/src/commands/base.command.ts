import { Command, Flags } from '@oclif/core';

export abstract class BaseCommand extends Command {
  static baseFlags = {
    'pretty-log': Flags.boolean({
      default: false,
      description: 'Use pretty formatting instead of JSON logs',
    }),
  };
  protected usePrettyLog = false;

  error(input: Error | string, options?: { code?: string; exit?: false | number }): never {
    const message = typeof input === 'string' ? input : input.message;

    if (!this.usePrettyLog) {
      this.logJson({
        context: this.constructor.name,
        level: 'error',
        message,
        pid: process.pid,
        timestamp: Date.now(),
      });
    }

    if (options?.exit === false) {
      super.error(input, { ...options, exit: false });
      throw input;
    }

    return super.error(
      input,
      options ? { ...options, exit: options.exit as number | undefined } : undefined
    );
  }

  protected initializeLogging(flags: { 'pretty-log'?: boolean }): void {
    this.usePrettyLog = flags['pretty-log'] ?? false;
  }

  log(message?: string, ...args: unknown[]): void {
    if (this.usePrettyLog) {
      super.log(message, ...args);
    } else {
      this.logJson({
        context: this.constructor.name,
        level: 'info',
        message: message || '',
        pid: process.pid,
        timestamp: Date.now(),
      });
    }
  }

  protected logJson(json: unknown): void {
    console.log(JSON.stringify(json));
  }

  warn(input: Error | string): Error | string {
    const message = typeof input === 'string' ? input : input.message;
    if (this.usePrettyLog) {
      return super.warn(input);
    }

    this.logJson({
      context: this.constructor.name,
      level: 'warn',
      message,
      pid: process.pid,
      timestamp: Date.now(),
    });
    return input;
  }
}
