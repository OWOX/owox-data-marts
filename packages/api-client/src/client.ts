import { exchangeAccessToken, normalizeApiOrigin, readResponseBody } from './auth.js';
import { DataMartsApi } from './data-marts.js';
import { DestinationsApi } from './destinations.js';
import { createHttpError } from './errors.js';
import { StoragesApi } from './storages.js';

export type OWOXApiClientOptions = {
  apiOrigin: string;
  apiKeyId: string;
  apiKeySecret: string;
  fetchImpl?: typeof fetch;
};

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
    return this.getJsonWithAuth<T>(path, query, true);
  }

  private async getJsonWithAuth<T>(
    path: string,
    query: Record<string, string> | undefined,
    retryOnUnauthorized: boolean
  ): Promise<T> {
    const response = await this.fetchImpl(this.buildUrl(path, query), {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'x-owox-authorization': `Bearer ${await this.getAccessToken()}`,
        'x-owox-api-key-id': this.apiKeyId,
      },
    });

    if (response.status === 401 && retryOnUnauthorized) {
      this.accessToken = undefined;
      return this.getJsonWithAuth<T>(path, query, false);
    }

    const body = await readResponseBody(response);

    if (!response.ok) {
      throw createHttpError(response, body);
    }

    return body as T;
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

  private buildUrl(path: string, query?: Record<string, string>): URL {
    const url = new URL(path, this.apiOrigin);

    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value);
    }

    return url;
  }
}
