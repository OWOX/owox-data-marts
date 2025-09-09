import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** State variable to track if environment file has been loaded */
let isEnvFileLoaded = false;

/**
 * Result object returned by environment loading methods
 */
export interface EnvLoadResult {
  /** Log messages from the loading process */
  messages: string[];
  /** Whether the operation was successful */
  success: boolean;
}

/**
 * Result object returned by environment setting methods
 */
export interface EnvSetResult {
  /** Log messages from the setting process */
  messages: string[];
  /** Successfully set environment variables in "key=value" format */
  setVars: string[];
  /** Variables that were ignored with reasons */
  ignoredVars: string[];
  /** Whether the operation was successful */
  success: boolean;
}

/**
 * Environment manager for loading and setting environment variables
 *
 * Features:
 * - Load from .env files with priority system
 * - Set variables from objects with validation
 * - Prevent override of existing variables
 * - Comprehensive logging and error handling
 */
export class EnvManager {
  /**
   * Environment variable name for custom .env file path
   */
  private static readonly DEFAULT_ENV_FILE_PATH = 'OWOX_ENV_FILE_PATH';

  /**
   * Load environment variables from a file path
   *
   * Priority order:
   * 1. Existing environment variables (never overridden)
   * 2. Variables from the specified file
   *
   * @param filePath - Path to environment file (empty string uses fallback logic)
   * @returns Result object with success status and log messages
   *
   * @example
   * ```typescript
   * // Load specific file
   * const result = EnvManager.loadFromFile('.env.production');
   *
   * // Load with fallback logic (env var -> default .env)
   * const result = EnvManager.loadFromFile('');
   *
   * if (result.success) {
   *   console.log('✅ Environment loaded');
   * } else {
   *   console.error('❌ Failed:', result.messages);
   * }
   * ```
   */
  static loadFromFile(filePath = ''): EnvLoadResult {
    const messages: string[] = [];

    if (isEnvFileLoaded) {
      return {
        messages,
        success: true,
      };
    }

    const resolvedPath = this.resolveFilePath(filePath, messages);

    if (!existsSync(resolvedPath)) {
      isEnvFileLoaded = true;
      messages.push(`📁 Environment file not found: ${resolvedPath}`);

      return { messages, success: false };
    }

    const success = this.loadFromFileInternal(resolvedPath, messages);

    isEnvFileLoaded = true;

    return {
      messages,
      success,
    };
  }

  /**
   * Set environment variables from an object with validation
   *
   * Features:
   * - Converts values to strings automatically
   * - Validates keys (no empty/whitespace-only keys)
   * - Validates values (no undefined/null/empty values)
   * - Returns detailed results for logging/debugging
   *
   * @param envVars - Object with environment variable key-value pairs
   * @returns Result object with set variables, ignored variables, and messages
   *
   * @example
   * ```typescript
   * const result = EnvManager.setFromObject({
   *   PORT: 8080,           // number -> '8080'
   *   LOG_FORMAT: 'json',   // string -> 'json'
   *   DEBUG: true,          // boolean -> 'true'
   *   API_KEY: undefined,   // ignored (undefined)
   *   EMPTY: '',            // ignored (empty string)
   *   ' ': 'value'          // ignored (invalid key)
   * });
   *
   * console.log(`✅ Set ${result.setVars.length} variables`);
   * console.log(`⚠️ Ignored ${result.ignoredVars.length} variables`);
   * ```
   */
  static setFromObject(envVars: Record<string, unknown>): EnvSetResult {
    const messages: string[] = [];
    const setVars: string[] = [];
    const ignoredVars: string[] = [];

    if (!envVars || typeof envVars !== 'object') {
      return {
        messages: ['⚠️ Invalid environment variables object provided'],
        setVars,
        ignoredVars,
        success: false,
      };
    }

    for (const [key, value] of Object.entries(envVars)) {
      const sanitizedKey = key.trim();
      if (!sanitizedKey) {
        ignoredVars.push(`"${key}" (invalid key)`);
        continue;
      }

      if (value === undefined || value === null) {
        ignoredVars.push(`${key} (undefined/null value)`);
        continue;
      }

      const stringValue = String(value).trim();

      if (!stringValue) {
        ignoredVars.push(`${key} (empty string value)`);
        continue;
      }

      process.env[sanitizedKey] = stringValue;
      setVars.push(`${sanitizedKey}=${stringValue}`);
    }

    return {
      messages,
      setVars,
      ignoredVars,
      success: true,
    };
  }

  /**
   * Internal method to load environment variables from a file using dotenv
   *
   * This method:
   * - Uses dotenv with override:false to respect existing variables
   * - Tracks which variables were loaded vs skipped
   * - Provides detailed logging for debugging
   *
   * @private
   * @param resolvedPath - Absolute path to the environment file
   * @param messages - Array to collect log messages
   * @returns Boolean indicating whether the file was parsed successfully
   */
  private static loadFromFileInternal(resolvedPath: string, messages: string[]): boolean {
    const existingEnvVars = new Set(Object.keys(process.env));

    const result = dotenv.config({
      path: resolvedPath,
      override: false, // Don't override existing environment variables
    });

    if (result.error) {
      messages.push(`❌ Failed to parse environment file ${resolvedPath}: ${result.error.message}`);
      return false;
    }

    const loadedVars: string[] = [];
    const skippedVars: string[] = [];

    for (const key of Object.keys(result.parsed || {})) {
      if (existingEnvVars.has(key)) {
        skippedVars.push(key);
      } else {
        loadedVars.push(key);
      }
    }

    messages.push(
      `✅ Environment file processed successfully: ${loadedVars.length} loaded, ${skippedVars.length} skipped`
    );

    if (skippedVars.length > 0) {
      messages.push(`⏭️ Skipped existing variables: ${skippedVars.join(', ')}`);
    }

    return true;
  }

  /**
   * Resolve file path using fallback logic
   *
   * Priority order:
   * 1. Specified filePath parameter
   * 2. OWOX_ENV_FILE_PATH environment variable
   * 3. Default .env file in current working directory
   *
   * @private
   * @param filePath - User-specified file path
   * @param messages - Array to collect log messages
   * @returns Resolved absolute path to environment file
   */
  private static resolveFilePath(filePath: string, messages: string[]): string {
    const sanitizedPath = filePath.trim();

    if (sanitizedPath) {
      messages.push(`🎯 Using specified environment file: ${sanitizedPath}`);
      return sanitizedPath;
    } else if (process.env[this.DEFAULT_ENV_FILE_PATH]) {
      const envSanitizedPath = process.env[this.DEFAULT_ENV_FILE_PATH]?.trim();
      if (envSanitizedPath) {
        messages.push(`🔗 Using environment-defined file: ${envSanitizedPath}`);
        return envSanitizedPath;
      }
    }

    const defaultPath = path.resolve(process.cwd(), '.env');
    messages.push(`📄 Using default environment file: ${defaultPath}`);
    return defaultPath;
  }
}
