import {
  OWOXApiClient,
  OWOXApiError,
  type OWOXDataMart,
  type OWOXDataMartListOptions,
} from './index.js';

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

const dataMart: OWOXDataMart = {
  id: 'data-mart-1',
  title: 'Monthly revenue',
  status: 'PUBLISHED',
  storage: {
    type: 'GOOGLE_BIGQUERY',
    title: 'Analytics warehouse',
  },
  description: null,
  definitionType: 'SQL',
  triggersCount: 2,
  reportsCount: 3,
  createdByUser: {
    userId: 'user-1',
    fullName: 'Ada Lovelace',
    email: 'ada@example.test',
    avatar: null,
  },
  businessOwnerUsers: [],
  technicalOwnerUsers: [
    {
      userId: 'user-2',
      fullName: null,
      email: 'grace@example.test',
      avatar: null,
    },
  ],
  createdAt: '2026-07-20T12:00:00.000Z',
  modifiedAt: '2026-07-21T13:30:00.000Z',
  contexts: [{ id: 'context-1', name: 'Finance' }],
  availableForReporting: true,
  availableForMaintenance: false,
};

const dataMartWithExtension: OWOXDataMart = {
  ...dataMart,
  futureServerField: true,
};
void dataMartWithExtension;

describe('Data Marts API', () => {
  it('lists every visible Data Mart page through authenticated requests', async () => {
    const requests: string[] = [];
    const fetchImpl = createFetchMock(request => {
      requests.push(request.url);
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      if (request.method === 'GET' && request.url === '/api/data-marts') {
        expect(request.headers['x-owox-authorization']).toBe('Bearer access-token-1');
        expect(request.headers['x-owox-api-key-id']).toBe(apiKeyId);
        return createJsonResponse(200, {
          items: [dataMart],
          total: 2,
          nextOffset: 1,
        });
      }
      if (request.method === 'GET' && request.url === '/api/data-marts?offset=1') {
        return createJsonResponse(200, {
          items: [{ ...dataMart, id: 'data-mart-2', title: 'Acquisition costs' }],
          total: 2,
          nextOffset: null,
        });
      }
      return createJsonResponse(404, { message: 'Not found' });
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(client.dataMarts.list()).resolves.toEqual([
      dataMart,
      { ...dataMart, id: 'data-mart-2', title: 'Acquisition costs' },
    ]);
    expect(requests).toEqual([
      '/api/auth/api-keys/exchange',
      '/api/data-marts',
      '/api/data-marts?offset=1',
    ]);
  });

  it('starts at the requested offset and preserves the owner filter across pages', async () => {
    const requests: string[] = [];
    const fetchImpl = createFetchMock(request => {
      requests.push(request.url);
      if (request.method === 'POST') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      if (
        request.method === 'GET' &&
        request.url === '/api/data-marts?offset=25&ownerFilter=no_owners'
      ) {
        return createJsonResponse(200, {
          items: [dataMart],
          total: 27,
          nextOffset: 26,
        });
      }
      if (
        request.method === 'GET' &&
        request.url === '/api/data-marts?offset=26&ownerFilter=no_owners'
      ) {
        return createJsonResponse(200, {
          items: [{ ...dataMart, id: 'data-mart-2' }],
          total: 27,
          nextOffset: null,
        });
      }
      return createJsonResponse(404, { message: 'Not found' });
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(client.dataMarts.list({ offset: 25, ownerFilter: 'no_owners' })).resolves.toEqual([
      dataMart,
      { ...dataMart, id: 'data-mart-2' },
    ]);
    expect(requests).toEqual([
      '/api/auth/api-keys/exchange',
      '/api/data-marts?offset=25&ownerFilter=no_owners',
      '/api/data-marts?offset=26&ownerFilter=no_owners',
    ]);
  });

  it.each([
    ['a negative offset', { offset: -1 }],
    ['a fractional offset', { offset: 1.5 }],
    ['a non-finite offset', { offset: Number.NaN }],
    ['an unknown owner filter', { ownerFilter: 'all' }],
  ])('rejects list options with %s before making a request', async (_label, options) => {
    let requestCount = 0;
    const fetchImpl = createFetchMock(() => {
      requestCount += 1;
      return createJsonResponse(500, { message: 'Unexpected request' });
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(client.dataMarts.list(options as OWOXDataMartListOptions)).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'Invalid OWOX Data Mart list options',
      details: options,
    });
    expect(requestCount).toBe(0);
  });

  it.each([
    ['an unknown status', { ...dataMart, status: 'ARCHIVED' }],
    ['a missing nullable description', omit(dataMart, 'description')],
    ['a malformed storage', { ...dataMart, storage: { type: 'GOOGLE_BIGQUERY' } }],
    ['a fractional trigger count', { ...dataMart, triggersCount: 1.5 }],
    ['a malformed creator', { ...dataMart, createdByUser: { userId: 42 } }],
    [
      'an invalid creator email',
      { ...dataMart, createdByUser: { ...dataMart.createdByUser!, email: 'not-an-email' } },
    ],
    [
      'an invalid owner avatar URL',
      {
        ...dataMart,
        technicalOwnerUsers: [
          { ...dataMart.technicalOwnerUsers[0]!, avatar: 'not an absolute URL' },
        ],
      },
    ],
    ['a malformed context', { ...dataMart, contexts: [{ id: 'context-1' }] }],
    ['an invalid creation timestamp', { ...dataMart, createdAt: 'July 20, 2026' }],
    ['a missing availability flag', omit(dataMart, 'availableForReporting')],
  ])('rejects a list item with %s', async (_label, item) => {
    const response = {
      items: [item],
      total: 1,
      nextOffset: null,
    };
    const fetchImpl = createFetchMock(request => {
      if (request.method === 'POST') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      return createJsonResponse(200, response);
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    const result = client.dataMarts.list();
    await expect(result).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'OWOX Data Marts API returned an unexpected response shape',
      details: response,
    });
    await expect(result).rejects.toBeInstanceOf(OWOXApiError);
  });

  it.each([
    ['a negative total', { items: [], total: -1, nextOffset: null }],
    ['a fractional next offset', { items: [], total: 2, nextOffset: 1.5 }],
  ])('rejects pagination with %s', async (_label, response) => {
    const fetchImpl = createFetchMock(request => {
      if (request.method === 'POST') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      return createJsonResponse(200, response);
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(client.dataMarts.list()).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'OWOX Data Marts API returned an unexpected response shape',
      details: response,
    });
  });
});

function omit<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const { [key]: _omitted, ...rest } = value;
  return rest;
}
