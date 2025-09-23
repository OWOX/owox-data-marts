import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

/** State variable to track if environment file has been loaded */
let isEnvSet = false;

/**
 * Log levels for environment setup operations
 */
export enum LogLevel {
  LOG = 'log',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Log message interface for environment setup operations
 */
export interface LogMessage {
  /** Log level (log, warn, error) */
  logLevel: LogLevel;
  /** Log message content */
  message: string;
}

/**
 * Configuration interface for environment setup operations
 */
export interface EnvSetupConfig {
  /** Path to environment file (optional, uses fallback logic if empty) */
  envFile?: string;
  /** Whether to override existing variables when loading from file (default: false) */
  envFileOverride?: boolean;
  /** Whether to process environment file before flag variables (default: false) */
  envFileFirst?: boolean;
  /** Object containing flag variables to set */
  flagVars?: Record<string, unknown>;
  /** Whether to override existing variables when setting flag variables (default: false) */
  flagVarsOverride?: boolean;
  /** Object containing default variables to set (never override existing) */
  defaultVars?: Record<string, unknown>;
}

/**
 * Result object returned by environment setup operations
 */
export interface EnvSetupResult {
  /** Log messages from the setting process with levels */
  messages: LogMessage[];
  /** Whether the operation was successful */
  success: boolean;
}

/**
 * Internal result object for environment variable operations with detailed information
 */
interface EnvOperationResult {
  /** Successfully set environment variables in "key=value" format */
  setVars?: string[];
  /** Variables that were ignored with reasons */
  ignoredVars?: string[];
  /** Variables that were skipped because they already exist */
  skippedVars?: string[];
  /** Whether the operation was successful */
  success: boolean;
}

/**
 * Enumeration of supported environment object types for processing
 */
enum EnvObjectType {
  /** Flag variables (command-line style variables) */
  FLAGS = 'flags',
  /** Default variables (fallback values) */
  DEFAULT = 'default',
}

/**
 * Environment manager for loading and setting environment variables
 *
 * Features:
 * - Load from .env files with priority system
 * - Set variables from objects with validation
 * - Prevent override of existing variables
 * - Comprehensive logging with levels (log, warn, error) and error handling
 * - Returns structured log messages with appropriate emojis
 */
export class EnvManager {
  /**
   * Environment variable name for custom .env file path
   */
  private static readonly DEFAULT_ENV_FILE_PATH = 'OWOX_ENV_FILE_PATH';

  /**
   * Template messages for logging with placeholder support
   *
   * Templates use %placeholder% syntax for dynamic content:
   * - %file% - File path
   * - %type% - Environment object type (flags/default)
   * - %error% - Error message
   * - %qty% - Quantity/count
   * - %list% - Comma-separated list
   */
  private static readonly MESSAGES = {
    FILE_PATH_SPECIFIED: '📂 Using specified environment file: %file%',
    FILE_PATH_ENVIRONMENT: '🌍 Using environment-defined file: %file%',
    FILE_PATH_DEFAULT: '⚙️ Using default environment file: %file%',
    FILE_NOT_FOUND: '🔍 Environment file not found: %file%',
    FILE_PROCESSING: '🔄 Starting to process environment file: %file%',
    FILE_PARSE_FAILED: '💥 Empty content or failed to parse environment file: %file%',
    FILE_READ_FAILED: '📖 Failed to read file %file%: %error%',
    FILE_SUCCESS: '✨ Environment file processed successfully',
    FILE_FAILED: '🚫 Failed to process environment file',
    OBJECT_UNKNOWN: '❓ Unknown environment object type: %type%',
    OBJECT_INVALID: '🚨 Invalid %type% environment variables object provided',
    OBJECT_START: '🚀 Starting to set up %type% values to environment variables...',
    OBJECT_FAILED: '💔 Failed to set up %type% values to environment variables',
    DETAILS_SET: '✅ Set %qty% variables',
    DETAILS_IGNORED: '🗑️ Ignored %qty% invalid variables: %list%',
    DETAILS_SKIPPED: '⏭️ Skipped %qty% existing variables: %list%',
  };
  /**
   * Internal log buffer for the current setup operation
   * Reset at the start of each setupEnvironment() call
   */
  private static operationLog: LogMessage[] = [];

  /**
   * Setup environment variables from multiple sources with priority system
   *
   * @param config - Configuration object specifying sources and priorities (optional, uses defaults if not provided)
   * @returns Result with operation messages and success status
   *
   * @example
   * ```typescript
   * // With full configuration
   * const result = EnvManager.setupEnvironment({
   *   envFile: '.env.production',
   *   envFileOverride: false,
   *   envFileFirst: true,
   *   flagVars: { DEBUG: true, PORT: 3000 },
   *   flagVarsOverride: true,
   *   defaultVars: { NODE_ENV: 'development' }
   * });
   *
   * // With default configuration (loads default .env file only)
   * const result = EnvManager.setupEnvironment();
   *
   * if (result.success) {
   *   console.log('Environment setup completed');
   *   result.messages.forEach(msg => {
   *     console[msg.logLevel](msg.message);
   *   });
   * }
   * ```
   */
  static setupEnvironment(config: EnvSetupConfig = {}): EnvSetupResult {
    this.operationLog = [];

    if (isEnvSet) {
      return {
        messages: [...this.operationLog],
        success: true,
      };
    }

    const operations = this.buildOperations(config);
    const success = this.executeOperations(operations);

    isEnvSet = true;
    return { messages: [...this.operationLog], success };
  }

  /**
   * Build array of operations based on configuration priority settings
   *
   * @private
   * @param config - Environment setup configuration
   * @returns Array of operation functions to execute in order
   */
  private static buildOperations(config: EnvSetupConfig): Array<() => boolean> {
    const { envFileFirst = false } = config;
    const operations = [];

    if (envFileFirst) {
      operations.push(() => this.processEnvFile(config));
      operations.push(() => this.processEnvObject(config, EnvObjectType.FLAGS));
    } else {
      operations.push(() => this.processEnvObject(config, EnvObjectType.FLAGS));
      operations.push(() => this.processEnvFile(config));
    }

    operations.push(() => this.processEnvObject(config, EnvObjectType.DEFAULT));
    return operations;
  }

  /**
   * Execute all operations sequentially and return combined success status
   *
   * @private
   * @param operations - Array of operation functions to execute
   * @returns True if all operations succeeded, false otherwise
   */
  private static executeOperations(operations: Array<() => boolean>): boolean {
    return operations.reduce((allSuccessful, operation) => {
      const result = operation();
      return allSuccessful && result;
    }, true);
  }

  /**
   * Process environment file loading with validation and error handling
   *
   * @private
   * @param config - Environment setup configuration containing file settings
   * @returns True if file processing succeeded, false otherwise
   */
  private static processEnvFile(config: EnvSetupConfig): boolean {
    const { envFile = '', envFileOverride = false } = config;
    const resolvedPath = this.resolveFilePath(envFile);

    if (!existsSync(resolvedPath)) {
      this.logWarning(this.formatMessage(this.MESSAGES.FILE_NOT_FOUND, { file: resolvedPath }));
      return false;
    }
    this.logInfo(this.formatMessage(this.MESSAGES.FILE_PROCESSING, { file: resolvedPath }));

    const result = this.loadFromFile(resolvedPath, envFileOverride);
    if (result.success) {
      this.logOperationDetails(result);
      this.logInfo(this.MESSAGES.FILE_SUCCESS);
    } else {
      this.logError(this.MESSAGES.FILE_FAILED);
    }

    return result.success;
  }

  /**
   * Process environment variables from object (flags or defaults) with type validation
   *
   * @private
   * @param config - Environment setup configuration containing variable objects
   * @param type - Type of variables being processed (flags or default)
   * @returns True if object processing succeeded, false otherwise
   */
  private static processEnvObject(config: EnvSetupConfig, type: EnvObjectType): boolean {
    let vars;
    let override = false;
    if (type === EnvObjectType.FLAGS) {
      vars = config.flagVars;
      override = config.flagVarsOverride || false;
    } else if (type === EnvObjectType.DEFAULT) {
      vars = config.defaultVars;
    } else {
      this.logError(this.formatMessage(this.MESSAGES.OBJECT_UNKNOWN, { type }));
      return false;
    }

    if (vars) {
      if (typeof vars !== 'object') {
        this.logError(this.formatMessage(this.MESSAGES.OBJECT_INVALID, { type }));
        return false;
      }

      this.logInfo(this.formatMessage(this.MESSAGES.OBJECT_START, { type }));
      const result = this.setFromObject(vars, override);
      if (result.success) {
        this.logOperationDetails(result);
      } else {
        this.logError(this.formatMessage(this.MESSAGES.OBJECT_FAILED, { type }));
      }
      return result.success;
    }

    return true;
  }

  /**
   * Load environment variables from a file with error handling and validation
   *
   * Features:
   * - Reads file content safely with try-catch
   * - Parses .env format using dotenv library
   * - Validates non-empty content
   * - Returns detailed operation results
   *
   * @private
   * @param resolvedPath - Absolute path to environment file
   * @param override - Whether to override existing environment variables
   * @returns Operation result with success status and variable details
   *
   * @example
   * ```typescript
   * const result = this.loadFromFile('/path/to/.env', false);
   * if (result.success) {
   *   console.log(`Loaded ${result.setVars?.length} variables`);
   * }
   * ```
   */
  private static loadFromFile(resolvedPath = '', override = false): EnvOperationResult {
    let fileContent = '';
    try {
      // Read file content as UTF-8 string
      fileContent = readFileSync(resolvedPath, 'utf8');
    } catch (error) {
      this.logError(
        this.formatMessage(this.MESSAGES.FILE_READ_FAILED, {
          file: resolvedPath,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      );
      return { success: false };
    }

    const parsed = dotenv.parse(fileContent);

    if (Object.keys(parsed).length === 0) {
      this.logError(this.formatMessage(this.MESSAGES.FILE_PARSE_FAILED, { file: resolvedPath }));
      return { success: false };
    }

    return this.setFromObject(parsed, override);
  }

  /**
   * Set environment variables from an object with comprehensive validation
   *
   * Features:
   * - Converts values to strings automatically (number, boolean → string)
   * - Validates keys (no empty/whitespace-only keys)
   * - Validates values (no undefined/null/empty values after trimming)
   * - Respects existing variables unless override is true
   * - Returns detailed results for logging and debugging
   * - Sanitizes keys by trimming whitespace
   *
   * @private
   * @param envVars - Object with environment variable key-value pairs
   * @param override - Whether to override existing environment variables (default: false)
   * @returns Operation result with set/ignored/skipped variables and success status
   *
   * @example
   * ```typescript
   * const result = this.setFromObject({
   *   PORT: 8080,           // number → '8080'
   *   LOG_FORMAT: 'json',   // string → 'json'
   *   DEBUG: true,          // boolean → 'true'
   *   API_KEY: undefined,   // ignored (undefined)
   *   EMPTY: '',            // ignored (empty string)
   *   ' ': 'value'          // ignored (invalid key)
   * });
   *
   * console.log(`✅ Set ${result.setVars?.length} variables`);
   * console.log(`⚠️ Ignored ${result.ignoredVars?.length} variables`);
   * console.log(`⏭️ Skipped ${result.skippedVars?.length} existing variables`);
   * ```
   */
  private static setFromObject(
    envVars: Record<string, unknown>,
    override = false
  ): EnvOperationResult {
    const setVars: string[] = [];
    const ignoredVars: string[] = [];
    const skippedVars: string[] = [];

    for (const [key, value] of Object.entries(envVars)) {
      const sanitizedKey = key.trim();

      // Check if provided key is valid (not empty after trimming)
      if (!sanitizedKey) {
        ignoredVars.push(`"${key}" (invalid key)`);
        continue;
      }

      // Check if variable already exists with valid value and handle override logic
      if (!override && process.env[sanitizedKey]?.trim()) {
        skippedVars.push(`${sanitizedKey} (already exists)`);
        continue;
      }

      // Check if value is not empty (undefined, null, or empty string after conversion)
      if (value === undefined || value === null) {
        ignoredVars.push(`${key} (undefined/null value)`);
        continue;
      }
      const stringValue = String(value).trim();
      if (!stringValue) {
        ignoredVars.push(`${key} (empty string value)`);
        continue;
      }

      // Set the environment variable
      process.env[sanitizedKey] = stringValue;
      setVars.push(`${sanitizedKey}=***`);
    }

    return {
      setVars,
      ignoredVars,
      skippedVars,
      success: true,
    };
  }

  /**
   * Resolve file path using fallback logic with comprehensive path resolution
   *
   * Priority order:
   * 1. Specified filePath parameter (if not empty after trimming)
   * 2. OWOX_ENV_FILE_PATH environment variable (if set and not empty)
   * 3. Default .env file in current working directory
   *
   * @private
   * @param filePath - User-specified file path (may be empty for fallback logic)
   * @returns Resolved absolute path to environment file
   */
  private static resolveFilePath(filePath: string): string {
    const sanitizedPath = filePath.trim();

    if (sanitizedPath) {
      this.logInfo(this.formatMessage(this.MESSAGES.FILE_PATH_SPECIFIED, { file: sanitizedPath }));
      return sanitizedPath;
    } else if (process.env[this.DEFAULT_ENV_FILE_PATH]) {
      const envSanitizedPath = process.env[this.DEFAULT_ENV_FILE_PATH]?.trim();
      if (envSanitizedPath) {
        this.logInfo(
          this.formatMessage(this.MESSAGES.FILE_PATH_ENVIRONMENT, { file: envSanitizedPath })
        );
        return envSanitizedPath;
      }
    }

    const defaultPath = path.resolve(process.cwd(), '.env');
    this.logInfo(this.formatMessage(this.MESSAGES.FILE_PATH_DEFAULT, { file: defaultPath }));
    return defaultPath;
  }

  /**
   * Log detailed results of environment variable operation
   *
   * Logs counts and details for:
   * - Successfully set variables
   * - Ignored variables with reasons
   * - Skipped existing variables
   *
   * @private
   * @param result - Operation result containing variable details
   */
  private static logOperationDetails(result: EnvOperationResult): void {
    const { setVars, ignoredVars, skippedVars } = result;
    if (setVars && setVars.length) {
      this.logInfo(this.formatMessage(this.MESSAGES.DETAILS_SET, { qty: String(setVars.length) }));
    }

    if (ignoredVars && ignoredVars.length) {
      this.logWarning(
        this.formatMessage(this.MESSAGES.DETAILS_IGNORED, {
          qty: String(ignoredVars.length),
          list: ignoredVars.join(', '),
        })
      );
    }
    if (skippedVars && skippedVars.length) {
      this.logInfo(
        this.formatMessage(this.MESSAGES.DETAILS_SKIPPED, {
          qty: String(skippedVars.length),
          list: skippedVars.join(', '),
        })
      );
    }
  }

  /**
   * Log informational message
   * @private
   * @param message - Message to log
   */
  private static logInfo(message: string): void {
    this.operationLog.push({ logLevel: LogLevel.LOG, message });
  }

  /**
   * Log error message
   * @private
   * @param message - Error message to log
   */
  private static logError(message: string): void {
    this.operationLog.push({ logLevel: LogLevel.ERROR, message });
  }

  /**
   * Log warning message
   * @private
   * @param message - Warning message to log
   */
  private static logWarning(message: string): void {
    this.operationLog.push({ logLevel: LogLevel.WARN, message });
  }

  /**
   * Format message template by replacing placeholders with actual values
   *
   * @private
   * @param template - Message template with %placeholder% markers
   * @param replacements - Object with placeholder-value pairs
   * @returns Formatted message with placeholders replaced
   *
   * @example
   * ```typescript
   * const formatted = this.formatMessage(
   *   'Processing %type% with %count% items',
   *   { type: 'flags', count: '5' }
   * );
   * // Result: 'Processing flags with 5 items'
   * ```
   */
  private static formatMessage(template: string, replacements: Record<string, string>): string {
    return Object.entries(replacements).reduce(
      (msg, [key, value]) => msg.replace(`%${key}%`, value),
      template
    );
  }
}
