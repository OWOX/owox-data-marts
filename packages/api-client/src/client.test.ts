import { jest } from '@jest/globals';

import { OWOXApiClient, OWOXApiError, OWOXAuthError, OWOXConfigError } from './index.js';

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

function createApiKey(payload: {
  apiOrigin: string;
  apiKeyId: string;
  apiKeySecret: string;
}): string {
  return `owox_key_${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}`;
}

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
  const apiKey = createApiKey({ apiOrigin, apiKeyId, apiKeySecret });

  it('rejects invalid API key configuration before making network requests', () => {
    const fetchImpl = jest.fn<typeof fetch>();

    expect(() => new OWOXApiClient({ apiKey: 'not-an-owox-key', fetchImpl })).toThrow(
      OWOXConfigError
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

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
      apiKey,
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
      apiKey,
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
      apiKey,
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
      apiKey,
      fetchImpl: fetchMock.fetchImpl,
    });

    await client.dataMarts.list();
  });

  it('gets the API key auth context without exposing the API key secret', async () => {
    const context = {
      apiKeyId,
      authFlow: 'api_key',
      project: {
        id: 'project-1',
        title: 'Demo Project',
      },
      member: {
        userId: 'user-1',
        email: 'user@example.com',
        fullName: 'User Example',
        avatar: 'https://img.example.com/user.png',
        roles: ['viewer'],
      },
    };
    const fetchMock = createFetchMock(request => {
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }

      if (request.method === 'GET' && request.url === '/api/auth/context') {
        expect(request.headers['x-owox-authorization']).toBe('Bearer access-token-1');
        expect(request.headers['x-owox-api-key-id']).toBe(apiKeyId);
        return createJsonResponse(200, {
          userId: 'user-1',
          projectId: 'project-1',
          email: 'user@example.com',
          fullName: 'User Example',
          avatar: 'https://img.example.com/user.png',
          roles: ['viewer'],
          projectTitle: 'Demo Project',
          authFlow: 'api_key',
          apiKeyId,
          onboarding: {},
        });
      }

      return createJsonResponse(404, { message: 'Not found' });
    });

    const client = new OWOXApiClient({
      apiKey,
      fetchImpl: fetchMock.fetchImpl,
    });

    await expect(client.auth.getContext()).resolves.toEqual(context);
    expect(JSON.stringify(await client.auth.getContext())).not.toContain(apiKeySecret);
  });

  it('rejects an unexpected auth context response shape', async () => {
    const fetchMock = createFetchMock(request => {
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }

      if (request.method === 'GET' && request.url === '/api/auth/context') {
        return createJsonResponse(200, {
          userId: 'user-1',
          projectId: 'project-1',
          projectTitle: 'Demo Project',
          authFlow: 'api_key',
          apiKeyId,
        });
      }

      return createJsonResponse(404, { message: 'Not found' });
    });

    const client = new OWOXApiClient({
      apiKey,
      fetchImpl: fetchMock.fetchImpl,
    });

    await expect(client.auth.getContext()).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'OWOX auth context API returned an unexpected response shape',
    });
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
      apiKey,
      fetchImpl: fetchMock.fetchImpl,
    });

    await expect(client.storages.list()).resolves.toEqual([
      { id: 'storage-1', title: 'Storage', type: 'GOOGLE_BIGQUERY' },
    ]);

    expect(exchangeCount).toBe(2);
    expect(seenAuthorizationHeaders).toEqual(['Bearer token-1', 'Bearer token-2']);
  });

  it('gets and updates project settings through authenticated JSON requests', async () => {
    const fetchMock = createFetchMock(request => {
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }

      if (request.method === 'GET' && request.url === '/api/projects/settings') {
        expect(request.headers['x-owox-authorization']).toBe('Bearer access-token-1');
        return createJsonResponse(200, { description: 'Current description' });
      }

      if (request.method === 'PUT' && request.url === '/api/projects/settings/description') {
        expect(request.headers['content-type']).toBe('application/json');
        expect(request.headers['x-owox-authorization']).toBe('Bearer access-token-1');
        expect(request.body).toEqual({ description: 'Updated description' });
        return createJsonResponse(200, { description: 'Updated description' });
      }

      return createJsonResponse(404, { message: 'Not found' });
    });

    const client = new OWOXApiClient({
      apiKey,
      fetchImpl: fetchMock.fetchImpl,
    });

    await expect(client.project.getSettings()).resolves.toEqual({
      description: 'Current description',
    });
    await expect(client.project.updateDescription('Updated description')).resolves.toEqual({
      description: 'Updated description',
    });
  });

  it('retries an unauthorized project settings update once with a refreshed access token', async () => {
    let exchangeCount = 0;
    const seenAuthorizationHeaders: unknown[] = [];
    const fetchMock = createFetchMock(request => {
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        exchangeCount += 1;
        return createJsonResponse(200, { accessToken: `token-${exchangeCount}` });
      }

      if (request.method === 'PUT' && request.url === '/api/projects/settings/description') {
        seenAuthorizationHeaders.push(request.headers['x-owox-authorization']);
        expect(request.body).toEqual({ description: null });

        if (request.headers['x-owox-authorization'] === 'Bearer token-1') {
          return createJsonResponse(401, { code: 'TOKEN_EXPIRED', message: 'Token expired' });
        }

        return createJsonResponse(200, { description: null });
      }

      return createJsonResponse(404, { message: 'Not found' });
    });

    const client = new OWOXApiClient({
      apiKey,
      fetchImpl: fetchMock.fetchImpl,
    });

    await expect(client.project.updateDescription(null)).resolves.toEqual({
      description: null,
    });
    expect(exchangeCount).toBe(2);
    expect(seenAuthorizationHeaders).toEqual(['Bearer token-1', 'Bearer token-2']);
  });

  it('does not retry a forbidden project settings update', async () => {
    let exchangeCount = 0;
    let updateCount = 0;
    const fetchMock = createFetchMock(request => {
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        exchangeCount += 1;
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }

      if (request.method === 'PUT' && request.url === '/api/projects/settings/description') {
        updateCount += 1;
        return createJsonResponse(403, {
          code: 'FORBIDDEN',
          message: 'Project Admin role required',
        });
      }

      return createJsonResponse(404, { message: 'Not found' });
    });

    const client = new OWOXApiClient({
      apiKey,
      fetchImpl: fetchMock.fetchImpl,
    });

    await expect(client.project.updateDescription('Denied')).rejects.toMatchObject({
      name: 'OWOXApiError',
      status: 403,
      code: 'FORBIDDEN',
    });
    expect(exchangeCount).toBe(1);
    expect(updateCount).toBe(1);
  });

  it('rejects an unexpected project settings response shape', async () => {
    const fetchMock = createFetchMock(request => {
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }

      if (request.method === 'GET' && request.url === '/api/projects/settings') {
        return createJsonResponse(200, {});
      }

      return createJsonResponse(404, { message: 'Not found' });
    });

    const client = new OWOXApiClient({
      apiKey,
      fetchImpl: fetchMock.fetchImpl,
    });

    await expect(client.project.getSettings()).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'OWOX Project Settings API returned an unexpected response shape',
      details: {},
    });
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
      apiKey,
      fetchImpl: fetchMock.fetchImpl,
    }).storages.list();
    await new OWOXApiClient({
      apiKey,
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
      apiKey,
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
      apiKey,
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

  it('configures default stream requests without standard Undici streaming timeouts', async () => {
    let streamRequestInit: RequestInit | undefined;
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      const parsedUrl = new URL(request.url);

      if (request.method === 'POST' && parsedUrl.pathname === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }

      if (
        request.method === 'GET' &&
        parsedUrl.pathname === '/api/external/http-data/data-marts/dm-1.ndjson'
      ) {
        streamRequestInit = init;
        return new Response('{"id":"row-1"}\n', {
          status: 200,
          headers: { 'content-type': 'application/x-ndjson' },
        });
      }

      return createJsonResponse(404, { message: 'Not found' });
    });

    try {
      const client = new OWOXApiClient({
        apiKey,
      });

      await client.dataMarts.traverseData('dm-1');

      expect(
        (streamRequestInit as RequestInit & { dispatcher?: unknown }).dispatcher
      ).toBeDefined();
    } finally {
      fetchSpy.mockRestore();
    }
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
      apiKey,
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
      apiKey,
      fetchImpl: fetchMock.fetchImpl,
    });

    await expect(client.destinations.list()).resolves.toEqual([
      { id: 'destination-1', title: 'Destination', type: 'GOOGLE_SHEETS' },
    ]);
    expect(fetchMock.requests.some(request => request.url === '/api/data-destinations')).toBe(true);
  });
});
