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
  /** Optional so transports built before PATCH support remain source-compatible. */
  patchJson?<T>(path: string, jsonBody: unknown): Promise<T>;
  /** Optional so transports built before DELETE support remain source-compatible. */
  deleteJson?<T = void>(path: string): Promise<T>;
  getStream(path: string, query?: URLSearchParams): Promise<Response>;
  authenticate?(): Promise<void>;
};

/** Capability contract for transports that implement all current low-level write methods. */
export type OWOXTransportWithLowLevelWrites = OWOXTransport &
  Required<Pick<OWOXTransport, 'patchJson' | 'deleteJson'>>;

type QueryParams = Record<string, string> | URLSearchParams;
type FetchInit = RequestInit & { dispatcher?: unknown };

type ApiRequestOptions = {
  apiOrigin: string;
  fetchImpl: typeof fetch;
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  apiKeyId: string;
  accessToken?: string;
  query?: QueryParams;
  jsonBody?: unknown;
  accept?: string;
  fetchInit?: FetchInit;
};

const API_PATH_PREFIX = '/api/';
/** Keeps authenticated API paths within the conservative, widely supported URL size. */
const MAX_AUTHENTICATED_API_PATH_LENGTH = 2048;

/*
 * This validator intentionally remains inside the standalone public client while the
 * iframe host enforces the same rule at its raw-message trust boundary with host-local
 * errors. Both implementations consume the shared conformance oracle in
 * `test/contracts/authenticated-api-path-contract.mjs`, so either boundary drifting
 * fails both focused suites without coupling either credential boundary to the other.
 */

function unsafeApiPath(): OWOXConfigError {
  return new OWOXConfigError(
    'OWOX API path must be an absolute /api/ path without traversal or encoded separators'
  );
}

function pathBeforeQueryOrHash(path: string): string {
  const delimiter = path.search(/[?#]/);
  return delimiter === -1 ? path : path.slice(0, delimiter);
}

function hexDigitValue(code: number): number {
  if (code >= 48 && code <= 57) {
    return code - 48;
  }
  if (code >= 65 && code <= 70) {
    return code - 55;
  }
  if (code >= 97 && code <= 102) {
    return code - 87;
  }
  return -1;
}

/** Validates every escape once, then performs one bounded decode for traversal checks. */
function decodePathForValidation(path: string): string {
  for (let index = 0; index < path.length; index += 1) {
    if (path.charCodeAt(index) !== 37) {
      continue;
    }

    const high = hexDigitValue(path.charCodeAt(index + 1));
    const low = hexDigitValue(path.charCodeAt(index + 2));
    if (high === -1 || low === -1) {
      throw unsafeApiPath();
    }

    const encodedByte = high * 16 + low;
    // An encoded percent can reveal another escape on a later decode. Encoded path
    // separators are forbidden even when the decoded pathname would otherwise be safe.
    if (encodedByte === 0x25 || encodedByte === 0x2f || encodedByte === 0x5c) {
      throw unsafeApiPath();
    }
    index += 2;
  }

  try {
    return decodeURIComponent(path);
  } catch {
    throw unsafeApiPath();
  }
}

function assertAuthenticatedApiUrl(apiOrigin: string, url: URL): void {
  if (url.origin !== apiOrigin || !url.pathname.startsWith(API_PATH_PREFIX)) {
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
    path.length > MAX_AUTHENTICATED_API_PATH_LENGTH ||
    !pathToValidate.startsWith(API_PATH_PREFIX) ||
    pathToValidate.includes('\\')
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
  const url = resolveAuthenticatedApiUrl(options.apiOrigin, options.path, options.query);
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
