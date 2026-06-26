import {
  OWOXApiClient,
  OWOXApiError,
  OWOXAuthError,
  OWOXConfigError,
  type OWOXAuthContext,
} from '@owox/api-client';

import { BaseCommand } from '../base-command.js';
import { resolveAuthConfig, type AuthConfig } from '../config-store.js';

type StatusError = {
  message: string;
  name?: string;
  status?: number;
  code?: string;
};

type Status = {
  apiOrigin: string | null;
  apiKeyId: string | null;
  authenticated: boolean;
  envFile: string | null;
  project?: OWOXAuthContext['project'];
  member?: OWOXAuthContext['member'];
  error?: StatusError;
};

type StatusDeps = {
  createClient: (config: AuthConfig) => StatusClient;
};

type StatusClient = {
  authenticate(): Promise<void>;
  auth: {
    getContext(): Promise<OWOXAuthContext>;
  };
};

function normalizeStatusError(error: unknown): StatusError {
  if (error instanceof OWOXApiError || error instanceof OWOXAuthError) {
    return {
      message: error.message,
      name: error.name,
      status: error.status,
      code: error.code,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
    };
  }

  return {
    message: String(error),
  };
}

function isMissingAuthContextEndpoint(error: unknown): boolean {
  return error instanceof OWOXApiError && !(error instanceof OWOXAuthError) && error.status === 404;
}

function getAuthenticatedStatus(
  config: AuthConfig,
  envFile: string | null,
  context?: OWOXAuthContext
): Status {
  return {
    apiOrigin: config.apiOrigin,
    apiKeyId: config.apiKeyId,
    authenticated: true,
    envFile,
    ...(context ? { project: context.project, member: context.member } : {}),
  };
}

function getAuthenticationFailureStatus(
  config: AuthConfig,
  envFile: string | null,
  error: unknown
): Status {
  return {
    apiOrigin: config.apiOrigin,
    apiKeyId: config.apiKeyId,
    authenticated: false,
    envFile,
    error: normalizeStatusError(error),
  };
}

async function getExchangeOnlyStatus(
  client: StatusClient,
  config: AuthConfig,
  envFile: string | null
): Promise<Status> {
  try {
    await client.authenticate();
    return getAuthenticatedStatus(config, envFile);
  } catch (error) {
    return getAuthenticationFailureStatus(config, envFile, error);
  }
}

export function getMissingConfigStatus(
  env: NodeJS.ProcessEnv,
  envFile: string | null,
  error: OWOXConfigError
): Status {
  return {
    apiOrigin: null,
    apiKeyId: null,
    authenticated: false,
    envFile,
    error: normalizeStatusError(error),
  };
}

export async function getStatus(
  config: AuthConfig,
  envFile: string | null,
  deps: StatusDeps = { createClient: clientConfig => new OWOXApiClient(clientConfig) }
): Promise<Status> {
  const client = deps.createClient(config);

  try {
    return getAuthenticatedStatus(config, envFile, await client.auth.getContext());
  } catch (error) {
    if (isMissingAuthContextEndpoint(error)) {
      return getExchangeOnlyStatus(client, config, envFile);
    }

    return getAuthenticationFailureStatus(config, envFile, error);
  }
}

export default class StatusCommand extends BaseCommand {
  static override description = 'Validate OWOX Data Marts API credentials';
  static override flags = {
    ...BaseCommand.baseFlags,
  };

  async run(): Promise<void> {
    let status: Status;

    try {
      const { flags } = await this.parse(StatusCommand);
      const envFile = this.loadEnvironment(flags);

      try {
        status = await getStatus(resolveAuthConfig(), envFile, {
          createClient: config => this.createClient(config),
        });
      } catch (error) {
        if (!(error instanceof OWOXConfigError)) {
          throw error;
        }

        status = getMissingConfigStatus(process.env, envFile, error);
      }
    } catch (error) {
      this.handleCliError(error);
    }

    this.writeJson(status);

    if (!status.authenticated) {
      this.exit(1);
    }
  }
}
