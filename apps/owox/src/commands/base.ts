import { Command, Flags } from '@oclif/core';

/**
 * Base command class that provides common functionality for all CLI commands.
 * Implements configurable logging system with support for pretty and JSON formats.
 * Extends @oclif/core Command class.
 *
 * @augments {Command}
 *
 * @property {string[]} argv - Raw command-line arguments passed to the command
 * @property {import('@oclif/core').Config} config - Command configuration from oclif
 * @property {boolean} useJsonLog - Internal state for JSON logging format
 *
 * @example Basic command implementation
 * ```typescript
 * export default class MyCommand extends BaseCommand {
 *   static override description = 'My command description';
 *   static override examples = [
 *     '<%= config.bin %> my-command',
 *     '<%= config.bin %> my-command --log-format json'
 *   ];
 *
 *   public async run(): Promise<void> {
 *     const { flags } = await this.parse(MyCommand);
 *     this.initializeLogging(flags);
 *
 *     this.log('Starting process...');
 *     try {
 *       // Command implementation
 *       this.log('Success!');
 *     } catch (error) {
 *       this.error('Failed to execute command');
 *     }
 *   }
 * }
 * ```
 */
export abstract class BaseCommand extends Command {
  /**
   * Common flags available for all commands extending BaseCommand.
   * These flags will be merged with command-specific flags.
   *
   * @static
   * @type {import('@oclif/core').FlagInput}
   */
  static baseFlags = {
    'log-format': Flags.string({
      char: 'f',
      default: 'pretty',
      description: 'Log format to use (pretty or json)',
      options: ['pretty', 'json'],
    }),
  };
  /**
   * Internal state indicating whether JSON logging is enabled
   * @protected
   */
  protected useJsonLog = false;

  /**
   * Handles error logging with support for both pretty and JSON formats.
   *
   * @override
   * @param {Error | string} input - Error message or Error object
   * @param {object} [options] - Error handling options
   * @param {string} [options.code] - Error code
   * @param {false | number} [options.exit] - Exit code or false to prevent exit
   * @throws {Error} Always throws an error unless options.exit is false
   */
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

  /**
   * Initializes logging configuration based on provided flags.
   * Should be called at the start of each command's run method.
   *
   * @protected
   * @param {object} flags - Command flags with log-format option
   */
  protected initializeLogging(flags: { 'log-format'?: string }): void {
    this.useJsonLog = flags['log-format'] === 'json';
  }

  /**
   * Logs a message with support for both pretty and JSON formats.
   *
   * @override
   * @param {string} [message] - Message to log
   * @param {...unknown} args - Additional arguments for pretty format
   */
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

  /**
   * Helper method to log messages in JSON format.
   *
   * @protected
   * @param {object} json - Object to be logged as JSON
   * @param {string} json.context - Command class name
   * @param {'info' | 'warn' | 'error'} json.level - Log level
   * @param {string} json.message - Log message
   * @param {number} json.pid - Process ID
   * @param {number} json.timestamp - Unix timestamp in milliseconds
   */
  protected logJson(json: unknown): void {
    console.log(JSON.stringify(json));
  }

  /**
   * Logs a warning message with support for both pretty and JSON formats.
   *
   * @override
   * @param {Error | string} input - Warning message or Error object
   * @returns {Error | string} The input parameter for chaining
   */
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
