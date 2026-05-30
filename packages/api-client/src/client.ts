import { Agent, type Dispatcher } from 'undici';

import { exchangeAccessToken, normalizeApiOrigin, readResponseBody } from './auth.js';
import { DataMartsApi } from './data-marts.js';
import { DestinationsApi } from './destinations.js';
import { createHttpError } from './errors.js';
import { StoragesApi } from './storages.js';
import { requestApi } from './transport.js';

export type OWOXApiClientOptions = {
  apiOrigin: string;
  apiKeyId: string;
  apiKeySecret: string;
  fetchImpl?: typeof fetch;
};

type QueryParams = Record<string, string> | URLSearchParams;
type FetchInit = RequestInit & { dispatcher?: Dispatcher };

const streamFetchDispatcher = new Agent({ bodyTimeout: 0, headersTimeout: 0 });

export class OWOXApiClient {
  readonly dataMarts: DataMartsApi;
  readonly storages: StoragesApi;
  readonly destinations: DestinationsApi;

  private readonly apiOrigin: string;
  private readonly apiKeyId: string;
  private readonly apiKeySecret: string;
  private readonly fetchImpl: typeof fetch;
  private accessToken: string | undefined;

  constructor(options: OWOXApiClientOptions) {
    this.apiOrigin = normalizeApiOrigin(options.apiOrigin);
    this.apiKeyId = options.apiKeyId;
    this.apiKeySecret = options.apiKeySecret;
    this.fetchImpl = options.fetchImpl ?? fetch;

    this.dataMarts = new DataMartsApi(this);
    this.storages = new StoragesApi(this);
    this.destinations = new DestinationsApi(this);
  }

  async authenticate(): Promise<void> {
    await this.getAccessToken();
  }

  async getJson<T>(path: string, query?: Record<string, string>): Promise<T> {
    return this.getJsonWithAuth<T>(path, query);
  }

  async getStream(path: string, query?: URLSearchParams): Promise<Response> {
    const response = await this.requestWithAuth(path, query, 'application/x-ndjson', {
      dispatcher: streamFetchDispatcher,
    });
    if (!response.ok) {
      const body = await readResponseBody(response);
      throw createHttpError(response, body);
    }

    return response;
  }

  private async getJsonWithAuth<T>(path: string, query: QueryParams | undefined): Promise<T> {
    const response = await this.requestWithAuth(path, query, 'application/json');
    const body = await readResponseBody(response);

    if (!response.ok) {
      throw createHttpError(response, body);
    }

    return body as T;
  }

  private async requestWithAuth(
    path: string,
    query: QueryParams | undefined,
    accept: string,
    fetchInit?: FetchInit,
    retryOnUnauthorized = true
  ): Promise<Response> {
    const response = await requestApi({
      apiOrigin: this.apiOrigin,
      fetchImpl: this.fetchImpl,
      path,
      method: 'GET',
      apiKeyId: this.apiKeyId,
      accessToken: await this.getAccessToken(),
      query,
      accept,
      fetchInit,
    });

    if (response.status === 401 && retryOnUnauthorized) {
      this.accessToken = undefined;
      return this.requestWithAuth(path, query, accept, fetchInit, false);
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
