import { OWOXConfigError } from './errors.js';

export const API_KEY_PREFIX = 'owox_key_';

export type ParsedOWOXApiKey = {
  apiOrigin: string;
  apiKeyId: string;
  apiKeySecret: string;
};

type ApiKeyPayload = {
  apiOrigin?: unknown;
  apiKeyId?: unknown;
  apiKeySecret?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function parseApiOrigin(apiOrigin: string): string {
  let url: URL;
  try {
    url = new URL(apiOrigin);
  } catch (error) {
    throw new OWOXConfigError('OWOX_API_KEY apiOrigin must be a valid http or https origin', {
      cause: error,
    });
  }

  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new OWOXConfigError('OWOX_API_KEY apiOrigin must be a valid http or https origin');
  }

  return url.origin;
}

export function parseOWOXApiKey(apiKey: string | undefined): ParsedOWOXApiKey {
  if (!apiKey || !apiKey.startsWith(API_KEY_PREFIX)) {
    throw new OWOXConfigError(`OWOX_API_KEY is required and must start with ${API_KEY_PREFIX}`);
  }

  const encodedPayload = apiKey.slice(API_KEY_PREFIX.length);
  if (!encodedPayload || !/^[A-Za-z0-9_-]+$/.test(encodedPayload)) {
    throw new OWOXConfigError('OWOX_API_KEY must contain a valid base64url payload');
  }

  let decodedPayload: unknown;
  try {
    decodedPayload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch (error) {
    throw new OWOXConfigError('OWOX_API_KEY must contain a valid JSON payload', {
      cause: error,
    });
  }

  if (!isRecord(decodedPayload)) {
    throw new OWOXConfigError('OWOX_API_KEY must contain a JSON object');
  }

  const payload = decodedPayload as ApiKeyPayload;
  const apiOrigin = requiredString(payload.apiOrigin);
  const apiKeyId = requiredString(payload.apiKeyId);
  const apiKeySecret = requiredString(payload.apiKeySecret);
  if (!apiOrigin || !apiKeyId || !apiKeySecret) {
    throw new OWOXConfigError('OWOX_API_KEY must include apiOrigin, apiKeyId, and apiKeySecret');
  }

  return {
    apiOrigin: parseApiOrigin(apiOrigin),
    apiKeyId,
    apiKeySecret,
  };
}
