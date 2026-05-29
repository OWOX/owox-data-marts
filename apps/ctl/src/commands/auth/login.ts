import { Flags } from '@oclif/core';
import { OWOXApiClient, type OWOXApiClientOptions } from '@owox/api-client';
import { createInterface } from 'node:readline/promises';

import { BaseCommand } from '../../base-command.js';
import { ConfigStore, maskApiKeyId, type AuthConfig } from '../../config-store.js';
import { colors, renderJson } from '../../output.js';

type Authenticator = {
  authenticate(): Promise<void>;
};

type LoginDeps = {
  store: ConfigStore;
  createClient: (config: OWOXApiClientOptions) => Authenticator;
};

type LoginInput = {
  apiOrigin: string;
  apiKeyId: string;
  apiKeySecret: string;
};

type LoginFlags = {
  'api-origin'?: string;
  'api-key-id'?: string;
  'api-key-secret'?: string;
};

type LoginPrompts = {
  promptText: (message: string) => Promise<string>;
  promptSecret: (message: string) => Promise<string>;
};

const defaultDeps = (store = new ConfigStore()): LoginDeps => ({
  store,
  createClient: config => new OWOXApiClient(config),
});

export async function performLogin(
  input: LoginInput,
  deps: LoginDeps = defaultDeps()
): Promise<AuthConfig> {
  const config = {
    apiOrigin: input.apiOrigin.trim(),
    apiKeyId: input.apiKeyId.trim(),
    apiKeySecret: input.apiKeySecret,
  };

  await deps.createClient(config).authenticate();
  await deps.store.save(config);

  return config;
}

async function promptText(
  message: string,
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WriteStream = process.stdout
): Promise<string> {
  const readline = createInterface({
    input,
    output,
  });

  try {
    return await readline.question(message);
  } finally {
    readline.close();
  }
}

export async function promptSecret(
  message: string,
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WriteStream = process.stdout
): Promise<string> {
  if (!input.isTTY) {
    return promptText(message, input, output);
  }

  output.write(message);
  input.setRawMode(true);
  input.resume();

  return new Promise((resolve, reject) => {
    let value = '';

    const cleanup = () => {
      input.setRawMode(false);
      input.off('data', onData);
      input.pause();
      output.write('\n');
    };

    const onData = (chunk: Buffer) => {
      const text = chunk.toString('utf8');

      if (text === '\u0003') {
        cleanup();
        reject(new Error('Prompt cancelled'));
        return;
      }

      if (text === '\r' || text === '\n') {
        cleanup();
        resolve(value);
        return;
      }

      if (text === '\u007F') {
        value = value.slice(0, -1);
        return;
      }

      value += text;
    };

    input.on('data', onData);
  });
}

export async function resolveLoginInput(
  flags: LoginFlags,
  env: NodeJS.ProcessEnv = process.env,
  prompts: LoginPrompts = { promptText, promptSecret }
): Promise<LoginInput> {
  return {
    apiOrigin:
      flags['api-origin'] ??
      env.OWOX_API_ORIGIN ??
      (await prompts.promptText('OWOX Data Marts API origin: ')),
    apiKeyId:
      flags['api-key-id'] ?? env.OWOX_API_KEY_ID ?? (await prompts.promptText('API key ID: ')),
    apiKeySecret:
      flags['api-key-secret'] ??
      env.OWOX_API_KEY_SECRET ??
      (await prompts.promptSecret('API key secret: ')),
  };
}

export default class AuthLogin extends BaseCommand {
  static override description = 'Authenticate with OWOX Data Marts';
  static override examples = [
    '<%= config.bin %> auth login',
    '<%= config.bin %> auth login --api-origin https://app.owox.com --api-key-id pmk_xxx --api-key-secret xxx',
  ];
  static override flags = {
    ...BaseCommand.baseFlags,
    'api-origin': Flags.string({
      description: 'OWOX Data Marts API origin, for example https://app.owox.com',
    }),
    'api-key-id': Flags.string({
      description: 'API key ID',
    }),
    'api-key-secret': Flags.string({
      description: 'API key secret',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AuthLogin);

    try {
      this.loadEnvironment(flags);
      const config = await performLogin(await resolveLoginInput(flags), {
        store: new ConfigStore(),
        createClient: config => this.createClient(config),
      });

      if (this.outputFormat(flags) === 'json') {
        this.log(
          renderJson({
            apiOrigin: config.apiOrigin,
            apiKeyId: maskApiKeyId(config.apiKeyId),
            authenticated: true,
          })
        );
        return;
      }

      const palette = colors({ enabled: this.colorEnabled(flags) });
      this.log(palette.success('Authenticated with OWOX Data Marts'));
    } catch (error) {
      this.handleCliError(error, flags);
    }
  }
}
