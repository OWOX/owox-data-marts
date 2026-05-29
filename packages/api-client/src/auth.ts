import { createHttpError, OWOXAuthError, OWOXConfigError } from './errors.js';

export const API_KEY_EXCHANGE_PATH = '/api/auth/api-keys/exchange';

export type AuthConfig = {
  apiOrigin: string;
  apiKeyId: string;
  apiKeySecret: string;
  fetchImpl: typeof fetch;
};

type TokenExchangeResponse = {
  accessToken?: unknown;
};

export function normalizeApiOrigin(apiOrigin: string): string {
  if (!apiOrigin.trim()) {
    throw new OWOXConfigError('OWOX API origin is required');
  }

  let url: URL;
  try {
    url = new URL(apiOrigin);
  } catch (error) {
    throw new OWOXConfigError('OWOX API origin must be a valid http or https URL', {
      cause: error,
    });
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new OWOXConfigError('OWOX API origin must use http or https');
  }

  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new OWOXConfigError('OWOX API origin must include only scheme, host, and optional port');
  }

  return url.origin;
}

export async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  return text;
}

export async function exchangeAccessToken(config: AuthConfig): Promise<string> {
  const response = await config.fetchImpl(new URL(API_KEY_EXCHANGE_PATH, config.apiOrigin), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-owox-api-key-id': config.apiKeyId,
    },
    body: JSON.stringify({ apiKeySecret: config.apiKeySecret }),
  });
  const body = await readResponseBody(response);

  if (!response.ok) {
    throw createHttpError(response, body, { auth: true });
  }

  const tokenResponse = body as TokenExchangeResponse | undefined;
  if (
    !tokenResponse ||
    typeof tokenResponse.accessToken !== 'string' ||
    !tokenResponse.accessToken
  ) {
    throw new OWOXAuthError('OWOX authentication response did not include an access token', {
      status: response.status,
      details: body,
    });
  }

  return tokenResponse.accessToken;
}
