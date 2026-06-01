import { createNetworkError } from './errors.js';

type ApiRequestOptions = {
  apiOrigin: string;
  fetchImpl: typeof fetch;
  path: string;
  method: 'GET' | 'POST';
  apiKeyId: string;
  accessToken?: string;
  query?: Record<string, string>;
  jsonBody?: unknown;
};

function buildApiUrl(
  apiOrigin: string,
  path: string,
  query: Record<string, string> | undefined
): URL {
  const url = new URL(path, apiOrigin);

  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }

  return url;
}

export async function requestApi(options: ApiRequestOptions): Promise<Response> {
  const headers = new Headers({
    accept: 'application/json',
    'x-owox-api-key-id': options.apiKeyId,
  });
  const init: RequestInit = {
    method: options.method,
    headers,
  };

  if (options.accessToken) {
    headers.set('x-owox-authorization', `Bearer ${options.accessToken}`);
  }

  if (options.jsonBody !== undefined) {
    headers.set('content-type', 'application/json');
    init.body = JSON.stringify(options.jsonBody);
  }

  try {
    return await options.fetchImpl(
      buildApiUrl(options.apiOrigin, options.path, options.query),
      init
    );
  } catch (error) {
    throw createNetworkError(options.apiOrigin, error);
  }
}
