import { parseOWOXApiKey } from '../api-key.js';
import { exchangeAccessToken, normalizeApiOrigin, readResponseBody } from '../auth.js';
import { createHttpError } from '../errors.js';
import { requestApi, type OWOXTransport } from '../transport.js';

export type ApiKeyTransportOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
  /**
   * Passed straight through to the fetch call for long streaming reads.
   *
   * Typed loosely on purpose: naming undici's Agent here would drag a Node-only import
   * back into a package that has to build for the browser. `owox-ctl` supplies one.
   */
  streamDispatcher?: unknown;
};

type QueryParams = Record<string, string> | URLSearchParams;
type AuthenticatedRequestOptions = {
  method: 'GET' | 'POST' | 'PUT';
  query?: QueryParams;
  accept?: string;
  jsonBody?: unknown;
  fetchInit?: RequestInit & { dispatcher?: unknown };
};

/**
 * The trusted transport: authenticates with an OWOX API key.
 *
 * Lifted verbatim out of OWOXApiClient so the client can accept an alternative
 * transport without either of them knowing about the other's credentials.
 */
export class ApiKeyTransport implements OWOXTransport {
  private readonly apiOrigin: string;
  private readonly apiKeyId: string;
  private readonly apiKeySecret: string;
  private readonly fetchImpl: typeof fetch;
  private readonly streamDispatcher: unknown;
  private accessToken: string | undefined;

  constructor(options: ApiKeyTransportOptions) {
    const parsedApiKey = parseOWOXApiKey(options.apiKey);
    this.apiOrigin = normalizeApiOrigin(parsedApiKey.apiOrigin);
    this.apiKeyId = parsedApiKey.apiKeyId;
    this.apiKeySecret = parsedApiKey.apiKeySecret;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.streamDispatcher = options.streamDispatcher;
  }

  async authenticate(): Promise<void> {
    await this.getAccessToken();
  }

  async getJson<T>(path: string, query?: Record<string, string>): Promise<T> {
    return this.requestJsonWithAuth<T>(path, { method: 'GET', query });
  }

  async putJson<T>(path: string, jsonBody: unknown): Promise<T> {
    return this.requestJsonWithAuth<T>(path, { method: 'PUT', jsonBody });
  }

  async postJson<T>(path: string, jsonBody: unknown, accept?: string): Promise<T> {
    return this.requestJsonWithAuth<T>(path, { method: 'POST', jsonBody, accept });
  }

  async getStream(path: string, query?: URLSearchParams): Promise<Response> {
    const response = await this.requestWithAuth(path, {
      method: 'GET',
      query,
      accept: 'application/x-ndjson',
      ...(this.streamDispatcher ? { fetchInit: { dispatcher: this.streamDispatcher } } : {}),
    });

    if (!response.ok) {
      throw createHttpError(response, await readResponseBody(response));
    }

    return response;
  }

  private async requestJsonWithAuth<T>(
    path: string,
    options: AuthenticatedRequestOptions
  ): Promise<T> {
    const response = await this.requestWithAuth(path, options);
    const body = await readResponseBody(response);

    if (!response.ok) {
      throw createHttpError(response, body);
    }

    return body as T;
  }

  private async requestWithAuth(
    path: string,
    options: AuthenticatedRequestOptions,
    retryOnUnauthorized = true
  ): Promise<Response> {
    const response = await requestApi({
      apiOrigin: this.apiOrigin,
      fetchImpl: this.fetchImpl,
      path,
      method: options.method,
      apiKeyId: this.apiKeyId,
      accessToken: await this.getAccessToken(),
      query: options.query,
      accept: options.accept,
      jsonBody: options.jsonBody,
      fetchInit: options.fetchInit,
    });

    // One retry only: a second 401 means the credential is wrong, not stale.
    if (response.status === 401 && retryOnUnauthorized) {
      this.accessToken = undefined;
      return this.requestWithAuth(path, options, false);
    }

    return response;
  }

  private async getAccessToken(): Promise<string> {
    this.accessToken ??= await exchangeAccessToken({
      apiOrigin: this.apiOrigin,
      apiKeyId: this.apiKeyId,
      apiKeySecret: this.apiKeySecret,
      fetchImpl: this.fetchImpl,
    });

    return this.accessToken;
  }
}
