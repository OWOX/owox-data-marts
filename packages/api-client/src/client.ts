import { Agent, type Dispatcher } from 'undici';

import { parseOWOXApiKey } from './api-key.js';
import { AuthApi, exchangeAccessToken, normalizeApiOrigin, readResponseBody } from './auth.js';
import { DataMartsApi } from './data-marts.js';
import { DestinationsApi } from './destinations.js';
import { createHttpError } from './errors.js';
import { ModelCanvasApi } from './model-canvas.js';
import { ProjectApi } from './project.js';
import { StoragesApi } from './storages.js';
import { requestApi } from './transport.js';

export type OWOXApiClientOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
};

type QueryParams = Record<string, string> | URLSearchParams;
type FetchInit = RequestInit & { dispatcher?: Dispatcher };
type AuthenticatedRequestOptions = {
  method: 'GET' | 'PUT';
  query?: QueryParams;
  accept?: string;
  jsonBody?: unknown;
  fetchInit?: FetchInit;
};

const streamFetchDispatcher = new Agent({ bodyTimeout: 0, headersTimeout: 0 });

export class OWOXApiClient {
  readonly auth: AuthApi;
  readonly dataMarts: DataMartsApi;
  readonly storages: StoragesApi;
  readonly destinations: DestinationsApi;
  readonly models: ModelCanvasApi;
  readonly project: ProjectApi;

  private readonly apiOrigin: string;
  private readonly apiKeyId: string;
  private readonly apiKeySecret: string;
  private readonly fetchImpl: typeof fetch;
  private accessToken: string | undefined;

  constructor(options: OWOXApiClientOptions) {
    const parsedApiKey = parseOWOXApiKey(options.apiKey);
    this.apiOrigin = normalizeApiOrigin(parsedApiKey.apiOrigin);
    this.apiKeyId = parsedApiKey.apiKeyId;
    this.apiKeySecret = parsedApiKey.apiKeySecret;
    this.fetchImpl = options.fetchImpl ?? fetch;

    this.auth = new AuthApi(this);
    this.dataMarts = new DataMartsApi(this);
    this.storages = new StoragesApi(this);
    this.destinations = new DestinationsApi(this);
    this.models = new ModelCanvasApi(this);
    this.project = new ProjectApi(this);
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

  async getStream(path: string, query?: URLSearchParams): Promise<Response> {
    const response = await this.requestWithAuth(path, {
      method: 'GET',
      query,
      accept: 'application/x-ndjson',
      fetchInit: { dispatcher: streamFetchDispatcher },
    });
    if (!response.ok) {
      const body = await readResponseBody(response);
      throw createHttpError(response, body);
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

    if (response.status === 401 && retryOnUnauthorized) {
      this.accessToken = undefined;
      return this.requestWithAuth(path, options, false);
    }

    return response;
  }

  private async getAccessToken(): Promise<string> {
    if (!this.accessToken) {
      this.accessToken = await exchangeAccessToken({
        apiOrigin: this.apiOrigin,
        apiKeyId: this.apiKeyId,
        apiKeySecret: this.apiKeySecret,
        fetchImpl: this.fetchImpl,
      });
    }

    return this.accessToken;
  }
}
