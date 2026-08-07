/**
 * What every resource in this package actually needs from a transport.
 *
 * The seam already existed structurally -- each resource declared its own narrow
 * requester type -- this only gives it a name so an alternative implementation can be
 * injected. `authenticate` is optional: a transport that carries no credential of its
 * own has nothing to do.
 */
import { OWOXConfigError, createNetworkError } from './errors.js';

export type OWOXTransport = {
  getJson<T>(path: string, query?: Record<string, string>): Promise<T>;
  postJson<T>(path: string, jsonBody: unknown, accept?: string): Promise<T>;
  putJson<T>(path: string, jsonBody: unknown): Promise<T>;
  patchJson<T>(path: string, jsonBody: unknown): Promise<T>;
  deleteJson<T = void>(path: string): Promise<T>;
  getStream(path: string, query?: URLSearchParams): Promise<Response>;
  authenticate?(): Promise<void>;
};

type QueryParams = Record<string, string> | URLSearchParams;
type FetchInit = RequestInit & { dispatcher?: unknown };

type ApiRequestOptions = {
  apiOrigin: string;
  fetchImpl: typeof fetch;
  path: string;
  url?: URL;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  apiKeyId: string;
  accessToken?: string;
  query?: QueryParams;
  jsonBody?: unknown;
  accept?: string;
  fetchInit?: FetchInit;
};

const API_PATH_PREFIX = '/api/';
const ENCODED_SEPARATOR = /%(?:25)*(?:2f|5c)/i;
const ENCODED_SPECIAL_PATH_CHARACTER = /%(?:25)*(?:2e|2f|5c)/i;

function unsafeApiPath(): OWOXConfigError {
  return new OWOXConfigError(
    'OWOX API path must be an absolute /api/ path without traversal or encoded separators'
  );
}

function pathBeforeQueryOrHash(path: string): string {
  const delimiter = path.search(/[?#]/);
  return delimiter === -1 ? path : path.slice(0, delimiter);
}

function decodePathForValidation(path: string): string {
  let decoded = path;

  while (ENCODED_SPECIAL_PATH_CHARACTER.test(decoded)) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      throw unsafeApiPath();
    }
  }

  return decoded;
}

function assertAuthenticatedApiUrl(apiOrigin: string, url: URL): void {
  if (
    url.origin !== apiOrigin ||
    !url.pathname.startsWith(API_PATH_PREFIX) ||
    ENCODED_SEPARATOR.test(url.pathname)
  ) {
    throw unsafeApiPath();
  }

  const decodedPath = decodePathForValidation(url.pathname);
  if (
    decodedPath.includes('\\') ||
    decodedPath.split('/').some(segment => segment === '.' || segment === '..')
  ) {
    throw unsafeApiPath();
  }
}

/**
 * Resolves a caller-provided API path only after ruling out host changes, traversal,
 * and encoded separators. Callers holding credentials resolve before token exchange.
 */
export function resolveAuthenticatedApiUrl(
  apiOrigin: string,
  path: string,
  query: QueryParams | undefined
): URL {
  const pathToValidate = pathBeforeQueryOrHash(path);
  if (
    !pathToValidate.startsWith(API_PATH_PREFIX) ||
    pathToValidate.includes('\\') ||
    ENCODED_SEPARATOR.test(pathToValidate)
  ) {
    throw unsafeApiPath();
  }

  const decodedPath = decodePathForValidation(pathToValidate);
  if (decodedPath.split('/').some(segment => segment === '.' || segment === '..')) {
    throw unsafeApiPath();
  }

  const url = new URL(path, apiOrigin);
  assertAuthenticatedApiUrl(apiOrigin, url);

  if (query instanceof URLSearchParams) {
    query.forEach((value, key) => {
      url.searchParams.append(key, value);
    });
    return url;
  }

  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }

  return url;
}

export async function requestApi(options: ApiRequestOptions): Promise<Response> {
  const url =
    options.url ?? resolveAuthenticatedApiUrl(options.apiOrigin, options.path, options.query);
  assertAuthenticatedApiUrl(options.apiOrigin, url);
  const headers = new Headers({
    accept: options.accept ?? 'application/json',
    'x-owox-api-key-id': options.apiKeyId,
  });
  const init: FetchInit = {
    ...options.fetchInit,
    method: options.method,
    headers,
    redirect: 'error',
  };

  if (options.accessToken) {
    headers.set('x-owox-authorization', `Bearer ${options.accessToken}`);
  }

  if (options.jsonBody !== undefined) {
    headers.set('content-type', 'application/json');
    init.body = JSON.stringify(options.jsonBody);
  }

  try {
    return await options.fetchImpl(url, init);
  } catch (error) {
    throw createNetworkError(options.apiOrigin, error);
  }
}
