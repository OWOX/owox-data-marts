import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Result object returned by EnvManager methods
 */
export interface EnvLoadResult {
  /** Log messages */
  messages: string[];
  /** Whether the operation was successful */
  success: boolean;
}

interface ValidateFilePathResult {
  error?: string;
  resolvedPath?: string;
  success: boolean;
}

/**
 * Environment manager for loading environment variables
 * Supports loading from process arguments, specific files, or default .env file
 */
export class EnvManager {
  /**
   * Default environment variable name to indicate that env vars are already set
   */
  private static readonly DEFAULT_ENV_SET_FLAG = 'OWOX_ENV_SET';

  /**
   * Load environment variables from a file path (for CLI commands)
   * If envFilePath is empty, tries to load from default .env file
   * @param envFilePath - Path to environment file (can be empty string)
   * @param envSetFlag - Environment variable name to check if env is already set (defaults to OWOX_ENV_SET)
   * @returns Result object with success status and log messages
   * @example
   * ```typescript
   * const result = EnvManager.loadFromFile('.env.local');
   * if (result.success) {
   *   console.log('Environment loaded successfully');
   * } else {
   *   console.error('Failed to load environment:', result.messages);
   * }
   * ```
   */
  static loadFromFile(envFilePath: string, envSetFlag = this.DEFAULT_ENV_SET_FLAG): EnvLoadResult {
    const messages: string[] = [];

    // Check if environment is already configured
    const checkEnvSet = this.isEnvAlreadySet(envSetFlag);
    if (checkEnvSet.success) {
      return checkEnvSet;
    }

    // Try to load from specified file if provided and valid
    const specifiedFileResult = this.tryLoadFromPath(envFilePath, 'specified');
    if (specifiedFileResult.success) {
      specifiedFileResult.messages.unshift(...messages);
      return specifiedFileResult;
    }

    if (specifiedFileResult.messages.length > 0) {
      messages.push(...specifiedFileResult.messages);
    }

    // Try to load from default .env file
    const defaultPath = path.resolve(process.cwd(), '.env');
    const defaultFileResult = this.tryLoadFromPath(defaultPath, 'default');
    if (defaultFileResult.success) {
      defaultFileResult.messages.unshift(...messages);
      return defaultFileResult;
    }

    if (defaultFileResult.messages.length > 0) {
      messages.push(...defaultFileResult.messages);
    }

    messages.push('⚠️ No valid environment file found');

    return {
      messages,
      success: false,
    };
  }

  /**
   * Load environment variables from process arguments (for standalone scripts)
   * Parses --env-file flag or positional argument automatically
   * @param envSetFlag - Environment variable name to check if env is already set (defaults to OWOX_ENV_SET)
   * @returns Result object with success status and log messages
   * @example
   * ```typescript
   * // For command: node script.js --env-file .env.production
   * const result = EnvManager.loadFromProcessArgs();
   * if (!result.success) {
   *   console.error('Environment loading failed:', result.messages);
   *   process.exit(1);
   * }
   * ```
   */
  static loadFromProcessArgs(envSetFlag = this.DEFAULT_ENV_SET_FLAG): EnvLoadResult {
    const messages: string[] = [];

    // Check if environment is already configured
    const checkEnvSet = this.isEnvAlreadySet(envSetFlag);
    if (checkEnvSet.success) {
      return checkEnvSet;
    }

    const envFilePath = this.parseProcessArguments();

    const result = this.loadFromFile(envFilePath, envSetFlag);
    result.messages.unshift(...messages);
    return result;
  }

  /**
   * Check if environment is already configured
   * @private
   * @param envSetFlag - Environment variable name to check
   * @returns Result object indicating if environment is already set
   */
  private static isEnvAlreadySet(envSetFlag: string): EnvLoadResult {
    const sanitizedFlag = envSetFlag.trim();

    let success = false;
    if (process.env[sanitizedFlag]) {
      success = process.env[sanitizedFlag].toLowerCase() === 'true';
    }

    const messages: string[] = [];
    const result: EnvLoadResult = { messages, success };
    if (success) {
      messages.push(`✅ Environment already configured via ${sanitizedFlag}=true`);
    }

    return result;
  }

  /**
   * Internal method to load environment variables from a specific file
   * Assumes file exists and path is valid
   * @private
   * @param resolvedPath - Absolute path to the environment file
   * @returns Result object with success status and messages
   */
  private static loadFromFileInternal(resolvedPath: string): EnvLoadResult {
    const messages: string[] = [];

    const result = dotenv.config({
      path: resolvedPath,
    });

    if (result.error) {
      messages.push(
        `❌ Failed to parse environment file ${resolvedPath} with error: ${result.error.message}`
      );
      return {
        messages,
        success: false,
      };
    }

    return {
      messages,
      success: true,
    };
  }

  /**
   * Parse command-line arguments to find environment file path
   * @private
   * @returns The path to the environment file or empty string if not found
   */
  private static parseProcessArguments(): string {
    const args = process.argv.slice(2);

    // Parse arguments: --env-file /path/to/.env or -e /path/to/.env or just /path/to/.env
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      // Check for --env-file=path format
      if (arg?.startsWith('--env-file=')) {
        const MAX_SPLIT_PARTS = 2;
        return arg.split('=', MAX_SPLIT_PARTS)[1] || '';
      }

      // Check for --env-file path or -e path format
      if ((arg === '--env-file' || arg === '-e') && i + 1 < args.length) {
        return args[i + 1] || '';
      }

      // Check if arg looks like a file path (contains .env or has proper extension)
      if (arg && (arg.includes('.env') || arg.endsWith('.env'))) {
        return arg;
      }
    }

    return '';
  }

  /**
   * Try to load environment variables from a specific path
   * @private
   * @param filePath - Path to the environment file
   * @param pathType - Type of path being loaded (default or specified)
   * @returns Result object with success status and messages
   */
  private static tryLoadFromPath(
    filePath: string,
    pathType: 'default' | 'specified'
  ): EnvLoadResult {
    const messages: string[] = [];

    const fileValidation = this.validateFilePath(filePath);
    if (!fileValidation.success) {
      if (fileValidation.error) {
        messages.push(fileValidation.error);
      }

      return {
        messages,
        success: false,
      };
    }

    const result = this.loadFromFileInternal(fileValidation.resolvedPath!);
    if (result.success) {
      messages.push(
        `✅ Environment variables successfully loaded from ${pathType} file: ${fileValidation.resolvedPath}`
      );
      result.messages.unshift(...messages);
    }

    return result;
  }

  /**
   * Validate if file path exists and is accessible
   * @private
   * @param filePath - Path to validate
   * @returns Validation result with resolved path if successful
   */
  private static validateFilePath(filePath: string): ValidateFilePathResult {
    const sanitizedPath = filePath.trim();
    if (!sanitizedPath) {
      return { success: false };
    }

    const resolvedPath = path.resolve(sanitizedPath);
    if (!existsSync(resolvedPath)) {
      return { error: `📁 File not found: ${resolvedPath}`, success: false };
    }

    return { resolvedPath, success: true };
  }
}
