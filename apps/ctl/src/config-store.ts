import { OWOXConfigError } from '@owox/api-client';

export const DEFAULT_API_ORIGIN = 'https://app.owox.com';

export type AuthConfig = {
  apiOrigin: string;
  apiKeyId: string;
  apiKeySecret: string;
};

function requiredEnvValue(
  env: NodeJS.ProcessEnv,
  key: 'OWOX_API_KEY_ID' | 'OWOX_API_KEY_SECRET'
): string | undefined {
  const value = env[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

export function resolveAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const apiKeyId = requiredEnvValue(env, 'OWOX_API_KEY_ID');
  const apiKeySecret = requiredEnvValue(env, 'OWOX_API_KEY_SECRET');
  if (!apiKeyId && !apiKeySecret) {
    throw new OWOXConfigError('OWOX_API_KEY_ID and OWOX_API_KEY_SECRET are required');
  }

  if (!apiKeyId) {
    throw new OWOXConfigError('OWOX_API_KEY_ID is required');
  }

  if (!apiKeySecret) {
    throw new OWOXConfigError('OWOX_API_KEY_SECRET is required');
  }

  return {
    apiOrigin: env.OWOX_API_ORIGIN?.trim() || DEFAULT_API_ORIGIN,
    apiKeyId,
    apiKeySecret,
  };
}
