import { Command, Flags } from '@oclif/core';
import { EnvManager, type EnvSetupConfig, type EnvSetupResult } from '@owox/internal-helpers';
import { OWOXApiClient, OWOXApiError, OWOXAuthError, OWOXConfigError } from '@owox/api-client';

import { resolveAuthConfig, type AuthConfig } from './config-store.js';
import { renderJson } from './output.js';

type BaseFlags = {
  'env-file'?: string;
};

type SetupEnvironment = (config?: EnvSetupConfig) => EnvSetupResult;

export type NormalizedCliError = {
  message: string;
  status?: number;
  code?: string;
  name?: string;
  details?: unknown;
};

export function normalizeCliError(error: unknown): NormalizedCliError {
  if (error instanceof OWOXApiError || error instanceof OWOXAuthError) {
    return {
      message: error.message,
      status: error.status,
      code: error.code,
      name: error.name,
      details: error.details,
    };
  }

  if (error instanceof OWOXConfigError || error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
    };
  }

  return {
    message: String(error),
  };
}

export function setupEnvironmentFromFlags(
  flags: Pick<BaseFlags, 'env-file'>,
  setupEnvironment: SetupEnvironment = EnvManager.setupEnvironment.bind(EnvManager)
): string | null {
  const envFileValue = flags['env-file'];
  const envFile = typeof envFileValue === 'string' ? envFileValue : '';
  const hasExplicitEnvFile = envFile.trim().length > 0;
  const result = setupEnvironment({ envFile });

  if (hasExplicitEnvFile && !result.envFilePath) {
    throw new OWOXConfigError(`Failed to load environment file: ${envFile}`);
  }

  return result.envFilePath;
}

export abstract class BaseCommand extends Command {
  static baseFlags = {
    'env-file': Flags.string({
      char: 'e',
      description: 'Path to environment file to load variables from',
      helpValue: '/path/to/.env',
    }),
  };

  protected createClient(config: AuthConfig): OWOXApiClient {
    return new OWOXApiClient({ apiKey: config.apiKey });
  }

  protected loadEnvironment(flags: Pick<BaseFlags, 'env-file'>): string | null {
    return setupEnvironmentFromFlags(flags);
  }

  protected getAuthenticatedClient(): OWOXApiClient {
    return this.createClient(resolveAuthConfig());
  }

  protected writeJson(value: unknown): void {
    this.log(renderJson(value));
  }

  protected handleCliError(error: unknown): never {
    process.stderr.write(`${renderJson({ error: normalizeCliError(error) })}\n`);
    this.exit(1);
  }
}
