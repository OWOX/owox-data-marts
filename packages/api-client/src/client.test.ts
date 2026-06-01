import { OWOXApiClient, OWOXApiError, OWOXAuthError } from './index.js';

type RecordedRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
};

type FetchMock = {
  fetchImpl: typeof fetch;
  requests: RecordedRequest[];
};

const apiOrigin = 'https://example.test';

function createJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}

async function readRequestBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text) {
    return undefined;
  }

  return JSON.parse(text);
}

function createFetchMock(
  handler: (request: RecordedRequest) => Response | Promise<Response>
): FetchMock {
  const requests: RecordedRequest[] = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const parsedUrl = new URL(request.url);
    const recordedRequest: RecordedRequest = {
      method: request.method,
      url: `${parsedUrl.pathname}${parsedUrl.search}`,
      headers,
      body: await readRequestBody(request),
    };
    requests.push(recordedRequest);

    return handler(recordedRequest);
  };

  return { fetchImpl: fetchImpl as typeof fetch, requests };
}

describe('OWOXApiClient', () => {
  const apiKeyId = 'pmk_AbCdEfGhIjKlMnOpQrStUv';
  const apiKeySecret = 'secret-value-that-must-not-leak';

  it('exchanges API key credentials for an access token and reuses it in memory', async () => {
    let exchangeCount = 0;
    const fetchMock = createFetchMock(request => {
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        exchangeCount += 1;
        expect(request.headers['x-owox-api-key-id']).toBe(apiKeyId);
        expect(request.body).toEqual({ apiKeySecret });
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }

      if (request.method === 'GET' && request.url === '/api/data-storages') {
        expect(request.headers['x-owox-authorization']).toBe('Bearer access-token-1');
        return createJsonResponse(200, [
          { id: 'storage-1', title: 'Storage', type: 'GOOGLE_BIGQUERY' },
        ]);
      }

      if (request.method === 'GET' && request.url === '/api/data-destinations') {
        expect(request.headers['x-owox-authorization']).toBe('Bearer access-token-1');
        return createJsonResponse(200, [
          { id: 'destination-1', title: 'Destination', type: 'GOOGLE_SHEETS' },
        ]);
      }

      return createJsonResponse(404, { message: 'Not found' });
    });

    const client = new OWOXApiClient({
      apiOrigin,
      apiKeyId,
      apiKeySecret,
      fetchImpl: fetchMock.fetchImpl,
    });

    await expect(client.storages.list()).resolves.toHaveLength(1);
    await expect(client.destinations.list()).resolves.toHaveLength(1);
    expect(exchangeCount).toBe(1);
  });

  it('normalizes auth token exchange failures as OWOXAuthError without leaking the secret', async () => {
    const fetchMock = createFetchMock(request => {
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(401, { code: 'INVALID_API_KEY', message: 'Unauthorized' });
      }

      return createJsonResponse(404, { message: 'Not found' });
    });

    const client = new OWOXApiClient({
      apiOrigin,
      apiKeyId,
      apiKeySecret,
      fetchImpl: fetchMock.fetchImpl,
    });

    await expect(client.dataMarts.list()).rejects.toMatchObject({
      name: 'OWOXAuthError',
      status: 401,
      code: 'INVALID_API_KEY',
    });

    await client.dataMarts.list().catch(error => {
      expect(error).toBeInstanceOf(OWOXAuthError);
      expect(error.message).not.toContain(apiKeySecret);
    });
  });

  it('normalizes token exchange network failures without leaking the secret', async () => {
    const fetchMock = createFetchMock(() => {
      throw new TypeError('fetch failed');
    });

    const client = new OWOXApiClient({
      apiOrigin,
      apiKeyId,
      apiKeySecret,
      fetchImpl: fetchMock.fetchImpl,
    });

    await client.authenticate().catch(error => {
      expect(error).toBeInstanceOf(OWOXApiError);
      expect(error).not.toBeInstanceOf(OWOXAuthError);
      expect(error).toMatchObject({
        name: 'OWOXApiError',
        code: 'NETWORK_ERROR',
      });
      expect(error.message).toContain(`Unable to reach OWOX Data Marts API at ${apiOrigin}`);
      expect(error.message).not.toContain('fetch failed');
      expect(error.message).not.toContain(apiKeySecret);
    });
  });

  it('adds Bearer token and API key binding headers to authenticated requests', async () => {
    const fetchMock = createFetchMock(request => {
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'bound-token' });
      }

      if (request.method === 'GET' && request.url === '/api/data-marts') {
        expect(request.headers['x-owox-authorization']).toBe('Bearer bound-token');
        expect(request.headers['x-owox-api-key-id']).toBe(apiKeyId);
        return createJsonResponse(200, { items: [], total: 0, nextOffset: null });
      }

      return createJsonResponse(404, { message: 'Not found' });
    });

    const client = new OWOXApiClient({
      apiOrigin,
      apiKeyId,
      apiKeySecret,
      fetchImpl: fetchMock.fetchImpl,
    });

    await client.dataMarts.list();
  });

  it('refreshes the cached access token once after an authenticated request returns 401', async () => {
    let exchangeCount = 0;
    const seenAuthorizationHeaders: unknown[] = [];
    const fetchMock = createFetchMock(request => {
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        exchangeCount += 1;
        return createJsonResponse(200, { accessToken: `token-${exchangeCount}` });
      }

      if (request.method === 'GET' && request.url === '/api/data-storages') {
        seenAuthorizationHeaders.push(request.headers['x-owox-authorization']);

        if (request.headers['x-owox-authorization'] === 'Bearer token-1') {
          return createJsonResponse(401, { code: 'TOKEN_EXPIRED', message: 'Token expired' });
        }

        return createJsonResponse(200, [
          { id: 'storage-1', title: 'Storage', type: 'GOOGLE_BIGQUERY' },
        ]);
      }

      return createJsonResponse(404, { message: 'Not found' });
    });

    const client = new OWOXApiClient({
      apiOrigin,
      apiKeyId,
      apiKeySecret,
      fetchImpl: fetchMock.fetchImpl,
    });

    await expect(client.storages.list()).resolves.toEqual([
      { id: 'storage-1', title: 'Storage', type: 'GOOGLE_BIGQUERY' },
    ]);

    expect(exchangeCount).toBe(2);
    expect(seenAuthorizationHeaders).toEqual(['Bearer token-1', 'Bearer token-2']);
  });

  it('keeps access tokens scoped to a client instance instead of persisting them', async () => {
    let exchangeCount = 0;
    const seenAuthorizationHeaders: unknown[] = [];
    const fetchMock = createFetchMock(request => {
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        exchangeCount += 1;
        return createJsonResponse(200, { accessToken: `token-${exchangeCount}` });
      }

      if (request.method === 'GET' && request.url === '/api/data-storages') {
        seenAuthorizationHeaders.push(request.headers['x-owox-authorization']);
        return createJsonResponse(200, []);
      }

      return createJsonResponse(404, { message: 'Not found' });
    });

    await new OWOXApiClient({
      apiOrigin,
      apiKeyId,
      apiKeySecret,
      fetchImpl: fetchMock.fetchImpl,
    }).storages.list();
    await new OWOXApiClient({
      apiOrigin,
      apiKeyId,
      apiKeySecret,
      fetchImpl: fetchMock.fetchImpl,
    }).storages.list();

    expect(exchangeCount).toBe(2);
    expect(seenAuthorizationHeaders).toEqual(['Bearer token-1', 'Bearer token-2']);
  });

  it('normalizes authenticated HTTP failures as OWOXApiError', async () => {
    const fetchMock = createFetchMock(request => {
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }

      if (request.method === 'GET' && request.url === '/api/data-storages') {
        return createJsonResponse(500, {
          code: 'DATA_STORAGES_FAILED',
          message: 'Could not list storages',
          details: { requestId: 'request-1' },
        });
      }

      return createJsonResponse(404, { message: 'Not found' });
    });

    const client = new OWOXApiClient({
      apiOrigin,
      apiKeyId,
      apiKeySecret,
      fetchImpl: fetchMock.fetchImpl,
    });

    await client.storages.list().catch(error => {
      expect(error).toBeInstanceOf(OWOXApiError);
      expect(error).not.toBeInstanceOf(OWOXAuthError);
      expect(error).toMatchObject({
        status: 500,
        code: 'DATA_STORAGES_FAILED',
        details: { requestId: 'request-1' },
      });
    });
  });

  it('normalizes authenticated request network failures without leaking the secret', async () => {
    const fetchMock = createFetchMock(request => {
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }

      throw new TypeError('fetch failed');
    });

    const client = new OWOXApiClient({
      apiOrigin,
      apiKeyId,
      apiKeySecret,
      fetchImpl: fetchMock.fetchImpl,
    });

    await client.storages.list().catch(error => {
      expect(error).toBeInstanceOf(OWOXApiError);
      expect(error).not.toBeInstanceOf(OWOXAuthError);
      expect(error).toMatchObject({
        name: 'OWOXApiError',
        code: 'NETWORK_ERROR',
      });
      expect(error.message).toContain(`Unable to reach OWOX Data Marts API at ${apiOrigin}`);
      expect(error.message).not.toContain('fetch failed');
      expect(error.message).not.toContain(apiKeySecret);
    });
  });

  it('dataMarts.list calls the real paginated list endpoint shape', async () => {
    const fetchMock = createFetchMock(request => {
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }

      if (request.method === 'GET' && request.url === '/api/data-marts') {
        return createJsonResponse(200, {
          items: [{ id: 'mart-1', title: 'First Data Mart' }],
          total: 2,
          nextOffset: 1,
        });
      }

      if (request.method === 'GET' && request.url === '/api/data-marts?offset=1') {
        return createJsonResponse(200, {
          items: [{ id: 'mart-2', title: 'Second Data Mart' }],
          total: 2,
          nextOffset: null,
        });
      }

      return createJsonResponse(404, { message: 'Not found' });
    });

    const client = new OWOXApiClient({
      apiOrigin,
      apiKeyId,
      apiKeySecret,
      fetchImpl: fetchMock.fetchImpl,
    });

    await expect(client.dataMarts.list()).resolves.toEqual([
      { id: 'mart-1', title: 'First Data Mart' },
      { id: 'mart-2', title: 'Second Data Mart' },
    ]);
    expect(fetchMock.requests.map(request => request.url)).toContain('/api/data-marts?offset=1');
  });

  it('storages.list calls the real list endpoint shape', async () => {
    const fetchMock = createFetchMock(request => {
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }

      if (request.method === 'GET' && request.url === '/api/data-storages') {
        return createJsonResponse(200, [
          { id: 'storage-1', title: 'Storage', type: 'GOOGLE_BIGQUERY' },
        ]);
      }

      return createJsonResponse(404, { message: 'Not found' });
    });

    const client = new OWOXApiClient({
      apiOrigin,
      apiKeyId,
      apiKeySecret,
      fetchImpl: fetchMock.fetchImpl,
    });

    await expect(client.storages.list()).resolves.toEqual([
      { id: 'storage-1', title: 'Storage', type: 'GOOGLE_BIGQUERY' },
    ]);
    expect(fetchMock.requests.some(request => request.url === '/api/data-storages')).toBe(true);
  });

  it('destinations.list calls the real list endpoint shape', async () => {
    const fetchMock = createFetchMock(request => {
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }

      if (request.method === 'GET' && request.url === '/api/data-destinations') {
        return createJsonResponse(200, [
          { id: 'destination-1', title: 'Destination', type: 'GOOGLE_SHEETS' },
        ]);
      }

      return createJsonResponse(404, { message: 'Not found' });
    });

    const client = new OWOXApiClient({
      apiOrigin,
      apiKeyId,
      apiKeySecret,
      fetchImpl: fetchMock.fetchImpl,
    });

    await expect(client.destinations.list()).resolves.toEqual([
      { id: 'destination-1', title: 'Destination', type: 'GOOGLE_SHEETS' },
    ]);
    expect(fetchMock.requests.some(request => request.url === '/api/data-destinations')).toBe(true);
  });
});
