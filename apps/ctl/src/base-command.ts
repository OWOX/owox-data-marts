import { Command, Flags } from '@oclif/core';
import { EnvManager, type EnvSetupConfig, type EnvSetupResult } from '@owox/internal-helpers';
import {
  OWOXApiClient,
  OWOXApiError,
  OWOXAuthError,
  OWOXConfigError,
  type OWOXApiClientOptions,
} from '@owox/api-client';

import { ConfigStore, resolveAuthConfig } from './config-store.js';
import {
  renderJson,
  renderTable,
  shouldUseColor,
  type OutputFormat,
  type TableColumn,
} from './output.js';

type BaseFlags = {
  format?: string;
  'no-color'?: boolean;
  'env-file'?: string;
};

type SetupEnvironment = (config?: EnvSetupConfig) => EnvSetupResult;

export function setupEnvironmentFromFlags(
  flags: Pick<BaseFlags, 'env-file'>,
  setupEnvironment: SetupEnvironment = EnvManager.setupEnvironment.bind(EnvManager)
): void {
  const envFileValue = flags['env-file'];
  const envFile = typeof envFileValue === 'string' ? envFileValue : '';

  setupEnvironment({ envFile });
}

export abstract class BaseCommand extends Command {
  static baseFlags = {
    'env-file': Flags.string({
      char: 'e',
      description: 'Path to environment file to load variables from',
      helpValue: '/path/to/.env',
    }),
    format: Flags.string({
      default: 'table',
      description: 'Output format',
      options: ['table', 'json'],
    }),
    'no-color': Flags.boolean({
      description: 'Disable color output',
    }),
  };

  protected createClient(config: OWOXApiClientOptions): OWOXApiClient {
    return new OWOXApiClient(config);
  }

  protected loadEnvironment(flags: Pick<BaseFlags, 'env-file'>): void {
    setupEnvironmentFromFlags(flags);
  }

  protected async getAuthenticatedClient(): Promise<OWOXApiClient> {
    const resolved = await resolveAuthConfig({ store: new ConfigStore() });

    if (!resolved) {
      throw new OWOXConfigError(
        'Not authenticated. Run owox-ctl auth login or set OWOX_API_ORIGIN, OWOX_API_KEY_ID, and OWOX_API_KEY_SECRET.'
      );
    }

    return this.createClient(resolved.config);
  }

  protected writeRows<T extends Record<string, unknown>>(
    rows: T[],
    columns: TableColumn<T>[],
    flags: BaseFlags
  ): void {
    if (this.outputFormat(flags) === 'json') {
      this.log(renderJson(rows));
      return;
    }

    this.log(renderTable(rows, columns));
  }

  protected handleCliError(error: unknown, flags: BaseFlags): never {
    const normalized = this.normalizeError(error);

    if (this.outputFormat(flags) === 'json') {
      process.stderr.write(`${renderJson({ error: normalized })}\n`);
      this.exit(1);
    }

    this.error(normalized.message, {
      code: normalized.code,
      exit: 1,
    });
  }

  protected colorEnabled(flags: BaseFlags): boolean {
    return shouldUseColor({
      format: this.outputFormat(flags),
      noColor: flags['no-color'],
      stream: process.stdout,
      env: process.env,
    });
  }

  private normalizeError(error: unknown): {
    message: string;
    status?: number;
    code?: string;
    name?: string;
  } {
    if (error instanceof OWOXApiError || error instanceof OWOXAuthError) {
      return {
        message: error.message,
        status: error.status,
        code: error.code,
        name: error.name,
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

  protected outputFormat(flags: BaseFlags): OutputFormat {
    return flags.format === 'json' ? 'json' : 'table';
  }
}
