import { OWOXApiClient, OWOXApiError } from './index.js';

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

function createFetchMock(handler: (request: RecordedRequest) => Response): {
  fetchImpl: typeof fetch;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const parsedUrl = new URL(request.url);
    const recordedRequest = {
      method: request.method,
      url: `${parsedUrl.pathname}${parsedUrl.search}`,
      headers,
    };
    requests.push(recordedRequest);
    return handler(recordedRequest);
  };

  return { fetchImpl: fetchImpl as typeof fetch, requests };
}

describe('ModelCanvasApi', () => {
  it('gets a data mart page and edges for a storage through authenticated requests', async () => {
    const dataMartPage = {
      items: [
        {
          id: 'data-mart-1',
          title: 'Orders',
          status: 'PUBLISHED',
          description: 'Enriched orders',
          fieldCount: 12,
        },
      ],
      total: 2,
      nextOffset: 1,
    };
    const edges = [
      {
        id: 'edge-1',
        sourceDataMartId: 'data-mart-1',
        targetDataMartId: 'data-mart-2',
        joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'id' }],
      },
    ];
    const fetchMock = createFetchMock(request => {
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      if (
        request.method === 'GET' &&
        request.url === '/api/model-canvas/data-marts?storageId=storage-1&offset=0'
      ) {
        expect(request.headers['x-owox-authorization']).toBe('Bearer access-token-1');
        expect(request.headers['x-owox-api-key-id']).toBe(apiKeyId);
        return createJsonResponse(200, dataMartPage);
      }
      if (
        request.method === 'GET' &&
        request.url === '/api/model-canvas/edges?storageId=storage-1'
      ) {
        expect(request.headers['x-owox-authorization']).toBe('Bearer access-token-1');
        return createJsonResponse(200, { edges });
      }
      return createJsonResponse(404, { message: 'Not found' });
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl: fetchMock.fetchImpl });

    await expect(client.models.getDataMarts('storage-1', 0)).resolves.toEqual(dataMartPage);
    await expect(client.models.getEdges('storage-1')).resolves.toEqual(edges);
  });

  it('omits the optional offset when it is not provided', async () => {
    const fetchMock = createFetchMock(request => {
      if (request.method === 'POST') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      if (request.url === '/api/model-canvas/data-marts?storageId=storage-1') {
        return createJsonResponse(200, { items: [], total: 0, nextOffset: null });
      }
      return createJsonResponse(404, { message: 'Not found' });
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl: fetchMock.fetchImpl });

    await expect(client.models.getDataMarts('storage-1')).resolves.toEqual({
      items: [],
      total: 0,
      nextOffset: null,
    });
  });

  it.each([
    ['data marts', 'getDataMarts', { items: 'not-an-array', total: 1, nextOffset: null }],
    ['edges', 'getEdges', { edges: [{ id: 'edge-without-endpoints' }] }],
  ])('rejects an unexpected %s response shape', async (_label, method, response) => {
    const fetchMock = createFetchMock(request => {
      if (request.method === 'POST') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      return createJsonResponse(200, response);
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl: fetchMock.fetchImpl });

    const result =
      method === 'getDataMarts'
        ? client.models.getDataMarts('storage-1')
        : client.models.getEdges('storage-1');
    await expect(result).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: expect.stringContaining('unexpected response shape'),
      details: response,
    });
    await expect(result).rejects.toBeInstanceOf(OWOXApiError);
  });
});
