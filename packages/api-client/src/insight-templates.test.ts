import { OWOXApiClient, OWOXApiError, type OWOXProjectInsightTemplatesResponse } from './index.js';

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

const insightTemplates: OWOXProjectInsightTemplatesResponse = {
  insights: [
    {
      id: 'insight-template-1',
      title: 'Weekly performance summary',
      sourcesCount: 2,
      lastRenderedTemplateUpdatedAt: '2026-07-20T12:00:00.000Z',
      createdById: 'user-1',
      createdAt: '2026-07-19T12:00:00.000Z',
      modifiedAt: '2026-07-20T12:00:00.000Z',
      createdByUser: {
        userId: 'user-1',
        fullName: 'Ada Lovelace',
        email: 'ada@example.test',
        avatar: null,
      },
      dataMart: { id: 'data-mart-1', title: 'Marketing performance' },
      canDelete: true,
    },
  ],
};

describe('Insight Templates API', () => {
  it('lists project insight templates with optional pagination through an authenticated request', async () => {
    const fetchImpl = createFetchMock(request => {
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      if (
        request.method === 'GET' &&
        request.url === '/api/data-marts/insight-templates?limit=25&offset=50'
      ) {
        expect(request.headers['x-owox-authorization']).toBe('Bearer access-token-1');
        expect(request.headers['x-owox-api-key-id']).toBe(apiKeyId);
        return createJsonResponse(200, insightTemplates);
      }
      return createJsonResponse(404, { message: 'Not found' });
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(client.insights.getTemplates({ limit: 25, offset: 50 })).resolves.toEqual(
      insightTemplates
    );
  });

  it('omits pagination query parameters when options are not provided', async () => {
    const fetchImpl = createFetchMock(request => {
      if (request.method === 'POST') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      if (request.method === 'GET' && request.url === '/api/data-marts/insight-templates') {
        return createJsonResponse(200, { insights: [] });
      }
      return createJsonResponse(404, { message: 'Not found' });
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(client.insights.getTemplates()).resolves.toEqual({ insights: [] });
  });

  it('rejects an unexpected project insight-template response shape', async () => {
    const response = {
      insights: [
        {
          ...insightTemplates.insights[0],
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

    const result = client.insights.getTemplates();
    await expect(result).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'OWOX Project Insight Templates API returned an unexpected response shape',
      details: response,
    });
    await expect(result).rejects.toBeInstanceOf(OWOXApiError);
  });

  it('accepts absent optional creator metadata and a null render timestamp', async () => {
    const { createdByUser: _createdByUser, ...insightWithoutCreator } =
      insightTemplates.insights[0];
    const response = {
      insights: [{ ...insightWithoutCreator, lastRenderedTemplateUpdatedAt: null }],
    };
    const fetchImpl = createFetchMock(request => {
      if (request.method === 'POST') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      return createJsonResponse(200, response);
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(client.insights.getTemplates()).resolves.toEqual(response);
  });

  it('rejects malformed creator metadata', async () => {
    const response = {
      insights: [
        {
          ...insightTemplates.insights[0],
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

    await expect(client.insights.getTemplates()).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'OWOX Project Insight Templates API returned an unexpected response shape',
      details: response,
    });
  });
});
