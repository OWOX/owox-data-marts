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
      definitionRun: { kind: 'sql', sql: 'SELECT 1' },
      reportId: null,
      reportDefinition: null,
      insightId: null,
      insightDefinition: null,
      insightTemplateId: null,
      insightTemplateDefinition: null,
      aiSourceDefinition: null,
      createdAt: '2026-07-21T12:00:00.000Z',
      startedAt: '2026-07-21T12:00:01.000Z',
      finishedAt: '2026-07-21T12:05:00.000Z',
      logs: [],
      errors: null,
      additionalParams: null,
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

    await expect(client.runs.list({ limit: 25, offset: 50 })).resolves.toEqual(runHistory);
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

    await expect(client.runs.list()).resolves.toEqual({ runs: [] });
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

    const result = client.runs.list();
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

    await expect(client.runs.list()).rejects.toMatchObject({
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

    await expect(client.runs.list()).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'OWOX Project Run History API returned an unexpected response shape',
      details: response,
    });
  });

  it.each([
    ['createdAt', 'not-a-date'],
    ['startedAt', '2026-07-21'],
    ['finishedAt', '21 July 2026'],
    ['createdAt', '2026-02-30T12:00:00Z'],
    ['startedAt', '2026-04-31T12:00:00Z'],
    ['finishedAt', '2026-01-01T24:00:00Z'],
    ['finishedAt', '2026-07-21T12:00:60Z'],
    ['createdAt', '2026-07-21t12:00:00z'],
    ['finishedAt', '2026-01-01T12:00:00+24:00'],
  ] as const)('rejects an unsupported %s timestamp', async (field, value) => {
    const response = {
      runs: [
        {
          ...runHistory.runs[0],
          [field]: value,
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

    await expect(client.runs.list()).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'OWOX Project Run History API returned an unexpected response shape',
      details: response,
    });
  });

  it('accepts valid RFC3339 fractional seconds and non-UTC offsets', async () => {
    const response = {
      runs: [
        {
          ...runHistory.runs[0],
          createdAt: '2026-07-21T12:00:00.123456Z',
          startedAt: '2026-07-21T12:00:01+02:30',
          finishedAt: '2026-07-21T12:05:00-04:00',
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

    await expect(client.runs.list()).resolves.toEqual(response);
  });

  it.each([
    ['a run without an attributable author', null],
    ['an author with only the required user ID', { userId: 'user-1' }],
  ])('accepts %s', async (_case, createdByUser) => {
    const response = {
      runs: [
        {
          ...runHistory.runs[0],
          createdByUser,
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

    await expect(client.runs.list()).resolves.toEqual(response);
  });

  it('accepts a historical run whose definition snapshot is unavailable', async () => {
    const response = {
      runs: [
        {
          ...runHistory.runs[0],
          definitionRun: null,
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

    await expect(client.runs.list()).resolves.toEqual(response);
  });

  it.each([
    ['status', 'UNKNOWN'],
    ['type', 'UNKNOWN'],
    ['runType', 'automatic'],
    ['definitionRun', []],
    ['reportId', 42],
    ['reportDefinition', []],
    ['insightId', 42],
    ['insightDefinition', []],
    ['insightTemplateId', 42],
    ['insightTemplateDefinition', []],
    ['aiSourceDefinition', []],
    ['logs', [42]],
    ['errors', [42]],
    ['additionalParams', []],
    ['totals', { total: [] }],
  ])('rejects an invalid %s field', async (field, value) => {
    const response = {
      runs: [
        {
          ...runHistory.runs[0],
          [field]: value,
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

    await expect(client.runs.list()).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'OWOX Project Run History API returned an unexpected response shape',
      details: response,
    });
  });

  it.each([
    'definitionRun',
    'reportId',
    'reportDefinition',
    'insightId',
    'insightDefinition',
    'insightTemplateId',
    'insightTemplateDefinition',
    'aiSourceDefinition',
    'logs',
    'errors',
    'startedAt',
    'finishedAt',
    'additionalParams',
    'totals',
  ])('rejects a response that omits the required %s field', async field => {
    const run = { ...runHistory.runs[0] } as Record<string, unknown>;
    delete run[field];
    const response = { runs: [run] };
    const fetchImpl = createFetchMock(request => {
      if (request.method === 'POST') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      return createJsonResponse(200, response);
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(client.runs.list()).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'OWOX Project Run History API returned an unexpected response shape',
      details: response,
    });
  });
});
