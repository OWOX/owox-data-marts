import { Command, Flags } from '@oclif/core';
import { EnvManager, type Logger, LoggerFactory } from '@owox/internal-helpers';

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
   * Default port number for server applications
   * @static
   * @type {number}
   */
  static DEFAULT_PORT = 3000;
  /**
   * Logger instance for structured logging
   * @protected
   */
  private logger: Logger | undefined;

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

    this.logger?.error(message);

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
    this.error(`Failed to start process: ${message}`, { exit: 1 });
  }

  /**
   * Initializes logging configuration based on LOG_FORMAT environment variable.
   *
   * @protected
   */
  protected initializeLogging(): void {
    try {
      this.logger = LoggerFactory.createNamedLogger(this.constructor.name.toLowerCase());
      LoggerFactory.logConfigInfo();
    } catch (error) {
      this.error(
        `Failed to initialize logging: ${error instanceof Error ? error.message : String(error)}`,
        { exit: 1 }
      );
    }
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
  protected loadEnvironment(flags: Record<string, boolean | number | string | undefined>): void {
    const { 'env-file': envFileValue = '', ...flagVars } = flags;
    const defaultVars = {
      PORT: BaseCommand.DEFAULT_PORT,
    };

    const envFile = typeof envFileValue === 'string' ? envFileValue : String(envFileValue);

    const setResult = EnvManager.setupEnvironment({
      defaultVars,
      envFile,
      flagVars,
      flagVarsOverride: true,
    });

    this.initializeLogging();

    this.logger?.info(`Setting environment variables...`);

    for (const logMessage of setResult.messages) {
      this.logger?.log(logMessage.logLevel, logMessage.message);
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
    if (this.logger) {
      if (args.length > 0) {
        this.logger.info(message || '', { args });
      } else {
        this.logger.info(message || '');
      }
    } else {
      super.log(message, ...args);
    }
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
    this.logger?.warn(message);
    return super.warn(input);
  }
}
