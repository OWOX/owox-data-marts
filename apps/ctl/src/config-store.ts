import { parseOWOXApiKey } from '@owox/api-client';

export type AuthConfig = {
  apiKey: string;
  apiOrigin: string;
  apiKeyId: string;
  apiKeySecret: string;
};

export function resolveAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const apiKey = env.OWOX_API_KEY;
  const parsed = parseOWOXApiKey(apiKey);

  return {
    apiKey: apiKey!,
    ...parsed,
  };
}
