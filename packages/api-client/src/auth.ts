import type { JsonRequester } from './traversal.js';
import { createHttpError, OWOXApiError, OWOXAuthError, OWOXConfigError } from './errors.js';
import { requestApi } from './transport.js';

export const API_KEY_EXCHANGE_PATH = '/api/auth/api-keys/exchange';
export const AUTH_CONTEXT_PATH = '/api/auth/context';

export type AuthConfig = {
  apiOrigin: string;
  apiKeyId: string;
  apiKeySecret: string;
  fetchImpl: typeof fetch;
};

type TokenExchangeResponse = {
  accessToken?: unknown;
};

export type OWOXAuthContext = {
  apiKeyId: string;
  authFlow: 'api_key';
  project: {
    id: string;
    title: string | null;
  };
  member: {
    userId: string;
    email: string | null;
    fullName: string | null;
    avatar: string | null;
    roles: string[];
  };
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
  const response = await requestApi({
    apiOrigin: config.apiOrigin,
    fetchImpl: config.fetchImpl,
    path: API_KEY_EXCHANGE_PATH,
    method: 'POST',
    apiKeyId: config.apiKeyId,
    jsonBody: { apiKeySecret: config.apiKeySecret },
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === 'string' || value === null;
}

function parseAuthContext(response: unknown): OWOXAuthContext {
  if (!isRecord(response)) {
    throw new OWOXApiError('OWOX auth context API returned an unexpected response shape', {
      details: response,
    });
  }

  const projectTitle = response.projectTitle ?? null;
  const email = response.email ?? null;
  const fullName = response.fullName ?? null;
  const avatar = response.avatar ?? null;
  const roles = response.roles;

  if (
    typeof response.apiKeyId !== 'string' ||
    response.authFlow !== 'api_key' ||
    typeof response.projectId !== 'string' ||
    typeof response.userId !== 'string' ||
    !isNullableString(projectTitle) ||
    !isNullableString(email) ||
    !isNullableString(fullName) ||
    !isNullableString(avatar) ||
    !Array.isArray(roles) ||
    !roles.every((role): role is string => typeof role === 'string')
  ) {
    throw new OWOXApiError('OWOX auth context API returned an unexpected response shape', {
      details: response,
    });
  }

  return {
    apiKeyId: response.apiKeyId,
    authFlow: response.authFlow,
    project: {
      id: response.projectId,
      title: projectTitle,
    },
    member: {
      userId: response.userId,
      email,
      fullName,
      avatar,
      roles,
    },
  };
}

export class AuthApi {
  constructor(private readonly requester: JsonRequester) {}

  async getContext(): Promise<OWOXAuthContext> {
    return parseAuthContext(await this.requester.getJson<unknown>(AUTH_CONTEXT_PATH));
  }
}
