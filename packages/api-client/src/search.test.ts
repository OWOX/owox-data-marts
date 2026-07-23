import { OWOXApiClient, OWOXApiError, type OWOXSearchResult } from './index.js';

type RecordedRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
};

const apiOrigin = 'https://example.test';
const apiKeyId = 'pmk_AbCdEfGhIjKlMnOpQrStUv';
const apiKey = `owox_key_${Buffer.from(
  JSON.stringify({
    apiOrigin,
    apiKeyId,
    apiKeySecret: 'secret-value-that-must-not-leak',
  }),
  'utf8'
).toString('base64url')}`;

function createJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createFetchMock(handler: (request: RecordedRequest) => Response): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const parsedUrl = new URL(request.url);
    return handler({
      method: request.method,
      url: `${parsedUrl.pathname}${parsedUrl.search}`,
      headers,
    });
  }) as typeof fetch;
}

const searchResults: OWOXSearchResult[] = [
  {
    entityType: 'DATA_MART',
    entityId: 'data-mart-1',
    title: 'Monthly revenue by channel',
    description: null,
    finalScore: 87,
    kwScore: 70,
    vecScore: 92,
  },
  {
    entityType: 'DATA_STORAGE',
    entityId: 'storage-1',
    title: 'Analytics warehouse',
    description: 'Primary reporting storage',
    finalScore: 62,
    kwScore: 62,
    vecScore: null,
  },
];
const { description: _description, ...resultWithoutDescription } = searchResults[0];
const { vecScore: _vecScore, ...resultWithoutVecScore } = searchResults[0];

describe('Search API', () => {
  it('searches project entities with the backend query serialization', async () => {
    const fetchImpl = createFetchMock(request => {
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      if (
        request.method === 'GET' &&
        request.url ===
          '/api/search?q=monthly+revenue&limit=25&entityTypes=DATA_MART%2CDATA_STORAGE&excludeDrafts=false'
      ) {
        expect(request.headers['x-owox-authorization']).toBe('Bearer access-token-1');
        expect(request.headers['x-owox-api-key-id']).toBe(apiKeyId);
        return createJsonResponse(200, searchResults);
      }
      return createJsonResponse(404, { message: 'Not found' });
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(
      client.search.query('monthly revenue', {
        limit: 25,
        entityTypes: ['DATA_MART', 'DATA_STORAGE'],
        excludeDrafts: false,
      })
    ).resolves.toEqual(searchResults);
  });

  it('omits optional search query parameters when options are not provided', async () => {
    const fetchImpl = createFetchMock(request => {
      if (request.method === 'POST') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      if (request.method === 'GET' && request.url === '/api/search?q=revenue') {
        return createJsonResponse(200, []);
      }
      return createJsonResponse(404, { message: 'Not found' });
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(client.search.query('revenue')).resolves.toEqual([]);
  });

  it.each([
    ['a non-array response', { results: searchResults }],
    ['an unknown entity type', [{ ...searchResults[0], entityType: 'REPORT' }]],
    ['a missing nullable description', [resultWithoutDescription]],
    ['a string relevance score', [{ ...searchResults[0], finalScore: '87' }]],
    ['a missing nullable vector score', [resultWithoutVecScore]],
  ])('rejects %s', async (_label, response) => {
    const fetchImpl = createFetchMock(request => {
      if (request.method === 'POST') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      return createJsonResponse(200, response);
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    const result = client.search.query('revenue');
    await expect(result).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'OWOX Search API returned an unexpected response shape',
      details: response,
    });
    await expect(result).rejects.toBeInstanceOf(OWOXApiError);
  });
});
