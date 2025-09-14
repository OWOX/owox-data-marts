import { Command, Flags } from '@oclif/core';
import { EnvManager, LogLevel } from '@owox/internal-helpers';

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
 *     this.initializeLogging(flags['log-format']);
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
    'env-file': Flags.string({
      char: 'e',
      description: 'Path to environment file to load variables from',
      helpValue: '/path/to/.env',
    }),
    'log-format': Flags.string({
      char: 'f',
      description: 'Log format to use (pretty or json)',
      options: ['pretty', 'json'],
    }),
  };
  /**
   * Default log format used when no format is specified
   * @static
   * @type {string}
   */
  static DEFAULT_LOG_FORMAT = 'pretty';
  /**
   * Default port number for server applications
   * @static
   * @type {number}
   */
  static DEFAULT_PORT = 3000;
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
   * Handles startup errors by formatting the error message and exiting the process.
   * Converts any error type to a string message and prefixes it with context.
   *
   * @protected
   * @param {unknown} error - Error of any type to be handled
   * @throws {never} Always exits the process with exit code 1
   */
  protected handleStartupError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.error(`Failed to start dump process: ${message}`, { exit: 1 });
  }

  /**
   * Initializes logging configuration based on LOG_FORMAT environment variable.
   *
   * @protected
   */
  protected initializeLogging(): void {
    this.useJsonLog = process.env.LOG_FORMAT === 'json';
  }

  /**
   * Loads environment variables from a file specified in flags or from default .env file.
   * This method delegates to EnvManager.loadFromFile() and logs the loading process.
   * If no env-file is specified, it attempts to load from the default .env file.
   * Also sets default environment variables if they don't exist.
   *
   * @protected
   * @param {object} flags - Command flags object containing 'env-file' and 'log-format' properties
   *
   * @example
   * ```typescript
   * const flags = { 'env-file': '/path/to/.env' };
   * this.loadEnvironment(flags);
   * ```
   */
  protected loadEnvironment(flags: { 'env-file'?: string; 'log-format'?: string }): void {
    const { 'env-file': envFile = '', ...flagVars } = flags;
    const defaultVars = {
      LOG_FORMAT: BaseCommand.DEFAULT_LOG_FORMAT,
      PORT: BaseCommand.DEFAULT_PORT,
    };

    const setResult = EnvManager.setupEnvironment({
      defaultVars,
      envFile,
      flagVars,
      flagVarsOverride: true,
    });

    this.initializeLogging();

    this.log(`🔧 Setting environment variables...`);

    for (const logMessage of setResult.messages) {
      switch (logMessage.logLevel) {
        case LogLevel.ERROR: {
          this.error(logMessage.message, { exit: false });
          break;
        }

        case LogLevel.LOG: {
          this.log(logMessage.message);
          break;
        }

        case LogLevel.WARN: {
          this.warn(logMessage.message);
          break;
        }

        default: {
          this.log(logMessage.message);
        }
      }
    }
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
   * Helper method to log structured data in JSON format.
   * Outputs the JSON representation directly to console.
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
