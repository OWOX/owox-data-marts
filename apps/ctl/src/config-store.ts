import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import envPaths from 'env-paths';
import { OWOXConfigError } from '@owox/api-client';

export type AuthConfig = {
  apiOrigin: string;
  apiKeyId: string;
  apiKeySecret: string;
};

export type ResolvedAuthConfig = {
  source: 'env' | 'stored';
  config: AuthConfig;
};

type ResolveAuthConfigInput = {
  env?: NodeJS.ProcessEnv;
  store?: ConfigStore;
};

function isAuthConfig(value: unknown): value is AuthConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.apiOrigin === 'string' &&
    typeof record.apiKeyId === 'string' &&
    typeof record.apiKeySecret === 'string'
  );
}

export function getDefaultConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.OWOX_CTL_CONFIG_PATH) {
    return env.OWOX_CTL_CONFIG_PATH;
  }

  return join(envPaths('owox', { suffix: '' }).config, 'ctl', 'config.json');
}

export function maskApiKeyId(apiKeyId: string): string {
  if (apiKeyId.length <= 8) {
    return `${apiKeyId.slice(0, 2)}...`;
  }

  return `${apiKeyId.slice(0, 8)}...`;
}

export class ConfigStore {
  constructor(readonly path = getDefaultConfigPath()) {}

  async read(): Promise<AuthConfig | null> {
    try {
      const raw = await readFile(this.path, 'utf8');
      const parsed = JSON.parse(raw) as unknown;

      if (!isAuthConfig(parsed)) {
        throw new OWOXConfigError(`Invalid owox-ctl config file at ${this.path}`);
      }

      return parsed;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return null;
      }

      throw error;
    }
  }

  async save(config: AuthConfig): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    await chmod(dirname(this.path), 0o700).catch(() => undefined);
    await writeFile(this.path, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await chmod(this.path, 0o600).catch(() => undefined);
  }

  async remove(): Promise<boolean> {
    let removed = true;

    try {
      await rm(this.path);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        removed = false;
      } else {
        throw error;
      }
    }

    if (removed) {
      try {
        await stat(this.path);
        throw new OWOXConfigError(`Failed to remove owox-ctl config file at ${this.path}`);
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
          throw error;
        }
      }
    }

    return removed;
  }
}

export async function resolveAuthConfig(
  input: ResolveAuthConfigInput = {}
): Promise<ResolvedAuthConfig | null> {
  const env = input.env ?? process.env;
  const store = input.store ?? new ConfigStore();
  const envValues = {
    apiOrigin: env.OWOX_API_ORIGIN,
    apiKeyId: env.OWOX_API_KEY_ID,
    apiKeySecret: env.OWOX_API_KEY_SECRET,
  };
  const hasAnyEnvValue = Object.values(envValues).some(value => value !== undefined);

  if (hasAnyEnvValue) {
    if (!envValues.apiOrigin || !envValues.apiKeyId || !envValues.apiKeySecret) {
      throw new OWOXConfigError(
        'OWOX_API_ORIGIN, OWOX_API_KEY_ID, and OWOX_API_KEY_SECRET must be set together'
      );
    }

    return {
      source: 'env',
      config: {
        apiOrigin: envValues.apiOrigin,
        apiKeyId: envValues.apiKeyId,
        apiKeySecret: envValues.apiKeySecret,
      },
    };
  }

  const stored = await store.read();
  return stored ? { source: 'stored', config: stored } : null;
}
