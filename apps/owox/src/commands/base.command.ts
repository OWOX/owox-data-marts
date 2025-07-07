import { Command, Flags } from '@oclif/core';

export abstract class BaseCommand extends Command {
  static baseFlags = {
    'log-format': Flags.string({
      char: 'f',
      default: 'pretty',
      description: 'Log format to use (pretty or json)',
      options: ['pretty', 'json']
    }),
  };
  protected useJsonLog = false;

  error(input: Error | string, options?: { code?: string; exit?: false | number }): never {
    const message = typeof input === 'string' ? input : input.message;

    if (this.useJsonLog) {
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

  protected initializeLogging(flags: { 'log-format'?: string }): void {
    this.useJsonLog = flags['log-format'] === 'json';
  }

  log(message?: string, ...args: unknown[]): void {
    if (this.useJsonLog) {
      this.logJson({
        context: this.constructor.name,
        level: 'info',
        message: message || '',
        pid: process.pid,
        timestamp: Date.now(),
      });
    } else {
      super.log(message, ...args);
    }
  }

  protected logJson(json: unknown): void {
    console.log(JSON.stringify(json));
  }

  warn(input: Error | string): Error | string {
    const message = typeof input === 'string' ? input : input.message;
    if (this.useJsonLog) {
      this.logJson({
        context: this.constructor.name,
        level: 'warn',
        message,
        pid: process.pid,
        timestamp: Date.now(),
      });
      
      return input;
    }

    return super.warn(input);
  }
}
