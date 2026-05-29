import { OWOXApiClient, type OWOXApiClientOptions } from '@owox/api-client';

import { BaseCommand } from '../../base-command.js';
import {
  ConfigStore,
  maskApiKeyId,
  resolveAuthConfig,
  type AuthConfig,
} from '../../config-store.js';
import { renderJson, renderKeyValues } from '../../output.js';

type AuthStatus = {
  apiOrigin: string;
  apiKeyId: string;
  authenticated: boolean;
};

type AuthStatusDeps = {
  createClient: (config: OWOXApiClientOptions) => {
    authenticate(): Promise<void>;
  };
};

export async function getAuthStatus(
  config: AuthConfig,
  deps: AuthStatusDeps = { createClient: clientConfig => new OWOXApiClient(clientConfig) }
): Promise<AuthStatus> {
  await deps.createClient(config).authenticate();

  return {
    apiOrigin: config.apiOrigin,
    apiKeyId: maskApiKeyId(config.apiKeyId),
    authenticated: true,
  };
}

export default class AuthStatusCommand extends BaseCommand {
  static override description = 'Show OWOX Data Marts authentication status';
  static override flags = {
    ...BaseCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AuthStatusCommand);

    try {
      this.loadEnvironment(flags);
      const resolved = await resolveAuthConfig({ store: new ConfigStore() });

      if (!resolved) {
        const status = { authenticated: false };
        this.log(
          flags.format === 'json' ? renderJson(status) : renderKeyValues({ Authenticated: 'no' })
        );
        return;
      }

      const status = await getAuthStatus(resolved.config, {
        createClient: config => this.createClient(config),
      });

      if (flags.format === 'json') {
        this.log(renderJson(status));
        return;
      }

      this.log(
        renderKeyValues({
          'API origin': status.apiOrigin,
          'API key ID': status.apiKeyId,
          Authenticated: status.authenticated ? 'yes' : 'no',
        })
      );
    } catch (error) {
      this.handleCliError(error, flags);
    }
  }
}
