import { OWOXApiClient, OWOXApiError, type OWOXProjectDataMartRunsResponse } from './index.js';

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

const runHistory: OWOXProjectDataMartRunsResponse = {
  runs: [
    {
      id: 'run-1',
      status: 'SUCCESS',
      type: 'CONNECTOR',
      runType: 'scheduled',
      dataMartId: 'data-mart-1',
      dataMart: { id: 'data-mart-1', title: 'Marketing performance' },
      createdAt: '2026-07-21T12:00:00.000Z',
      startedAt: '2026-07-21T12:00:01.000Z',
      finishedAt: '2026-07-21T12:05:00.000Z',
      logs: [],
      errors: null,
      totals: null,
      createdByUser: {
        userId: 'user-1',
        fullName: 'Ada Lovelace',
        email: 'ada@example.test',
        avatar: null,
      },
    },
  ],
};

describe('Runs API', () => {
  it('gets project run history with optional pagination through an authenticated request', async () => {
    const fetchImpl = createFetchMock(request => {
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      if (request.method === 'GET' && request.url === '/api/data-marts/runs?limit=25&offset=50') {
        expect(request.headers['x-owox-authorization']).toBe('Bearer access-token-1');
        expect(request.headers['x-owox-api-key-id']).toBe(apiKeyId);
        return createJsonResponse(200, runHistory);
      }
      return createJsonResponse(404, { message: 'Not found' });
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(client.runs.getHistory({ limit: 25, offset: 50 })).resolves.toEqual(runHistory);
  });

  it('omits pagination query parameters when options are not provided', async () => {
    const fetchImpl = createFetchMock(request => {
      if (request.method === 'POST') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      if (request.method === 'GET' && request.url === '/api/data-marts/runs') {
        return createJsonResponse(200, { runs: [] });
      }
      return createJsonResponse(404, { message: 'Not found' });
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(client.runs.getHistory()).resolves.toEqual({ runs: [] });
  });

  it('rejects an unexpected run-history response shape', async () => {
    const response = {
      runs: [
        {
          ...runHistory.runs[0],
          dataMart: { id: 'data-mart-1' },
        },
      ],
    };
    const fetchImpl = createFetchMock(request => {
      if (request.method === 'POST') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      return createJsonResponse(200, response);
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    const result = client.runs.getHistory();
    await expect(result).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'OWOX Project Run History API returned an unexpected response shape',
      details: response,
    });
    await expect(result).rejects.toBeInstanceOf(OWOXApiError);
  });

  it('rejects malformed run creator metadata', async () => {
    const response = {
      runs: [
        {
          ...runHistory.runs[0],
          createdByUser: { userId: 42 },
        },
      ],
    };
    const fetchImpl = createFetchMock(request => {
      if (request.method === 'POST') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      return createJsonResponse(200, response);
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(client.runs.getHistory()).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'OWOX Project Run History API returned an unexpected response shape',
      details: response,
    });
  });

  it('rejects a run without creator metadata', async () => {
    const { createdByUser: _createdByUser, ...runWithoutCreator } = runHistory.runs[0];
    const response = { runs: [runWithoutCreator] };
    const fetchImpl = createFetchMock(request => {
      if (request.method === 'POST') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      return createJsonResponse(200, response);
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(client.runs.getHistory()).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'OWOX Project Run History API returned an unexpected response shape',
      details: response,
    });
  });
});
