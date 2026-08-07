import {
  OWOXApiClient,
  OWOXApiError,
  type OWOXDataMartRun,
  type OWOXDataMartRunDetail,
  type OWOXDataQualityRule,
} from './index.js';
import { jest } from '@jest/globals';

type RecordedRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
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

async function readRequestBody(request: Request): Promise<unknown> {
  const text = await request.text();
  return text ? JSON.parse(text) : undefined;
}

function createFetchMock(
  handler: (request: RecordedRequest) => Response | Promise<Response>
): typeof fetch {
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
      body: await readRequestBody(request),
    });
  }) as typeof fetch;
}

const run: OWOXDataMartRun = {
  id: 'run-1',
  status: 'SUCCESS',
  type: 'CONNECTOR',
  runType: 'manual',
  dataMartId: 'data-mart-1',
  definitionRun: { type: 'connector' },
  reportId: null,
  reportDefinition: null,
  insightId: null,
  insightDefinition: null,
  insightTemplateId: null,
  insightTemplateDefinition: null,
  aiSourceDefinition: null,
  logs: [],
  errors: null,
  createdAt: '2026-08-07T08:00:00.000Z',
  startedAt: '2026-08-07T08:00:01.000Z',
  finishedAt: '2026-08-07T08:01:00.000Z',
  createdByUser: null,
  additionalParams: null,
  totals: null,
  qualitySummary: null,
};

const runDetail: OWOXDataMartRunDetail = { ...run, dataQuality: null };

const dataQualityRule: OWOXDataQualityRule = {
  key: 'null_rate:field:["email"]',
  category: 'null_rate',
  scope: { type: 'FIELD', fieldPath: ['email'] },
  severity: 'warning',
  enabled: true,
  parameters: { thresholdPercent: 0 },
  isApplicable: true,
};

const dataQualityDetail = {
  snapshot: {
    config: { rules: [dataQualityRule] },
    schema: null,
    relationships: [],
    definitionType: 'CONNECTOR',
  },
  summary: {
    state: 'PASSED',
    enabledChecks: 1,
    totalChecks: 1,
    passedChecks: 1,
    failedChecks: 0,
    notApplicableChecks: 0,
    errorChecks: 0,
    noticeFindings: 0,
    warningFindings: 0,
    errorFindings: 0,
    violationCount: 0,
    highestSeverity: null,
  },
  results: [],
} as const;

describe('Data Mart run lifecycle API', () => {
  it('starts, lists, reads, and cancels a Data Mart run through authenticated requests', async () => {
    const fetchImpl = createFetchMock(request => {
      if (request.method === 'POST' && request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }

      expect(request.headers['x-owox-authorization']).toBe('Bearer access-token-1');
      expect(request.headers['x-owox-api-key-id']).toBe(apiKeyId);

      if (request.method === 'POST' && request.url === '/api/data-marts/data%2Fmart/manual-run') {
        expect(request.body).toEqual({
          payload: {
            runType: 'MANUAL_BACKFILL',
            data: { StartDate: '2026-07-01', EndDate: '2026-07-31' },
          },
        });
        return createJsonResponse(201, { runId: '123e4567-e89b-12d3-a456-426614174000' });
      }
      if (
        request.method === 'GET' &&
        request.url === '/api/data-marts/data%2Fmart/runs?limit=25&offset=50'
      ) {
        return createJsonResponse(200, { runs: [run] });
      }
      if (request.method === 'GET' && request.url === '/api/data-marts/data%2Fmart/runs/run%2F1') {
        return createJsonResponse(200, runDetail);
      }
      if (
        request.method === 'POST' &&
        request.url === '/api/data-marts/data%2Fmart/runs/run%2F1/cancel'
      ) {
        expect(request.body).toBeUndefined();
        return new Response(null, { status: 204 });
      }
      return createJsonResponse(404, { message: 'Not found' });
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(
      client.runs.start('data/mart', {
        runType: 'MANUAL_BACKFILL',
        data: { StartDate: '2026-07-01', EndDate: '2026-07-31' },
      })
    ).resolves.toEqual({ runId: '123e4567-e89b-12d3-a456-426614174000' });
    await expect(
      client.runs.listForDataMart('data/mart', { limit: 25, offset: 50 })
    ).resolves.toEqual({ runs: [run] });
    await expect(client.runs.get('data/mart', 'run/1')).resolves.toEqual(runDetail);
    await expect(client.runs.cancel('data/mart', 'run/1')).resolves.toBeUndefined();
  });

  it('rejects malformed manual-run and run-history responses', async () => {
    const fetchImpl = createFetchMock(request => {
      if (request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      if (request.method === 'POST') {
        return createJsonResponse(201, { runId: 42 });
      }
      return createJsonResponse(200, { runs: [{ ...run, qualitySummary: undefined }] });
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(client.runs.start('dm-1')).rejects.toBeInstanceOf(OWOXApiError);
    await expect(client.runs.listForDataMart('dm-1')).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'OWOX Data Mart Runs API returned an unexpected response shape',
    });
  });

  it.each(['status', 'type', 'runType'] as const)(
    'rejects a null %s that the backend cannot produce',
    async field => {
      const fetchImpl = createFetchMock(request => {
        if (request.url === '/api/auth/api-keys/exchange') {
          return createJsonResponse(200, { accessToken: 'access-token-1' });
        }
        return createJsonResponse(200, { ...runDetail, [field]: null });
      });
      const client = new OWOXApiClient({ apiKey, fetchImpl });

      await expect(client.runs.get('dm-1', 'run-1')).rejects.toBeInstanceOf(OWOXApiError);
    }
  );

  it('rejects invalid request options before making a network request', async () => {
    const fetchImpl = jest.fn<typeof fetch>();
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(
      client.runs.start('dm-1', { runType: 'FULL_REFRESH' } as never)
    ).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'Invalid OWOX Data Mart run-start options',
    });
    await expect(client.runs.start('dm-1', { data: [] } as never)).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'Invalid OWOX Data Mart run-start options',
    });
    await expect(
      client.runs.start('dm-1', { data: { value: 'x'.repeat(1024 * 1024) } })
    ).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'OWOX Data Mart manual-run payload exceeds 1MB',
    });
    await expect(
      client.runs.listForDataMart('dm-1', { limit: '25' } as never)
    ).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'Invalid OWOX Data Mart run-list options',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects malformed Data Quality detail instead of returning an unchecked nested object', async () => {
    const malformedDetail = {
      ...runDetail,
      dataQuality: {
        snapshot: {
          config: { rules: [] },
          schema: null,
          relationships: [],
          definitionType: 'CONNECTOR',
        },
        summary: {
          state: 'NOT_A_REAL_STATE',
          enabledChecks: 0,
          totalChecks: 0,
          passedChecks: 0,
          failedChecks: 0,
          notApplicableChecks: 0,
          errorChecks: 0,
          noticeFindings: 0,
          warningFindings: 0,
          errorFindings: 0,
          violationCount: 0,
          highestSeverity: null,
        },
        results: [],
      },
    };
    const fetchImpl = createFetchMock(request => {
      if (request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      return createJsonResponse(200, malformedDetail);
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(client.runs.get('dm-1', 'run-1')).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'OWOX Data Mart Run API returned an unexpected response shape',
    });
  });

  it('accepts a nested Data Quality detail that matches the backend schema', async () => {
    const response = { ...runDetail, dataQuality: dataQualityDetail };
    const fetchImpl = createFetchMock(request => {
      if (request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      return createJsonResponse(200, response);
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(client.runs.get('dm-1', 'run-1')).resolves.toEqual(response);
  });

  it('wraps a non-object Data Quality result as an API response-shape error', async () => {
    const response = {
      ...runDetail,
      dataQuality: { ...dataQualityDetail, results: [null] },
    };
    const fetchImpl = createFetchMock(request => {
      if (request.url === '/api/auth/api-keys/exchange') {
        return createJsonResponse(200, { accessToken: 'access-token-1' });
      }
      return createJsonResponse(200, response);
    });
    const client = new OWOXApiClient({ apiKey, fetchImpl });

    await expect(client.runs.get('dm-1', 'run-1')).rejects.toMatchObject({
      name: 'OWOXApiError',
      message: 'OWOX Data Mart Run API returned an unexpected response shape',
    });
  });

  it('rejects nested Data Quality values outside the backend schema constraints', async () => {
    const invalidRules = [
      { ...dataQualityRule, scope: { type: 'FIELD', fieldPath: [] } },
      { ...dataQualityRule, scope: { type: 'FIELD', fieldPath: ['   '] } },
      { ...dataQualityRule, parameters: { thresholdPercent: -1 } },
      { ...dataQualityRule, parameters: { thresholdPercent: 101 } },
      { ...dataQualityRule, notApplicableReason: '' },
      {
        ...dataQualityRule,
        key: 'data_freshness:field:["email"]',
        category: 'data_freshness',
        parameters: { thresholdHours: -1 },
      },
      {
        ...dataQualityRule,
        key: 'data_freshness:field:["email"]',
        category: 'data_freshness',
        parameters: { thresholdHours: Number.MAX_SAFE_INTEGER },
      },
    ];

    for (const invalidRule of invalidRules) {
      const response = {
        ...runDetail,
        dataQuality: {
          ...dataQualityDetail,
          snapshot: {
            ...dataQualityDetail.snapshot,
            config: { rules: [invalidRule] },
          },
        },
      };
      const fetchImpl = createFetchMock(request => {
        if (request.url === '/api/auth/api-keys/exchange') {
          return createJsonResponse(200, { accessToken: 'access-token-1' });
        }
        return createJsonResponse(200, response);
      });
      const client = new OWOXApiClient({ apiKey, fetchImpl });

      await expect(client.runs.get('dm-1', 'run-1')).rejects.toBeInstanceOf(OWOXApiError);
    }
  });
});
